/**
 * IP Behavioral Tracker — rolling 15-minute window per IP.
 *
 * Tracks request count, distinct paths visited, and inter-request timing.
 * All data is in-process and automatically expires after the window.
 * This is NOT a substitute for proper rate-limiting — it feeds the entropy scorer.
 *
 * Memory safety:
 * - Each IpRecord is bounded to its rolling window timestamps + paths Set.
 * - The tracker enforces a `maxEntries` cap (default 50,000 IPs). When the cap
 *   is reached, the oldest entry by last-access time is evicted (approximate LRU).
 * - A periodic sweep runs every `sweepIntervalMs` (default 5 minutes) to delete
 *   IPs that have had zero activity within the rolling window — preventing the
 *   Map from accumulating stale records from one-off scanners.
 *
 * Multi-process note:
 * - This tracker is in-process only. For multi-worker deployments the entropy
 *   signal is per-worker — acceptable since entropy is advisory, not enforcement.
 *
 * @internal - defaultIpTracker is a shared in-process singleton. Pass a custom
 *   IpTracker instance to createMembrane({ ipTracker }) to isolate state
 *   between multiple membrane instances on the same server.
 */

const WINDOW_MS = 15 * 60 * 1000     // 15 minutes
const DEFAULT_MAX_ENTRIES = 50_000    // ~10 MB at ~200 bytes per IpRecord
const DEFAULT_SWEEP_INTERVAL = 5 * 60 * 1000 // sweep every 5 minutes

export interface IpSnapshot {
  /** Number of requests in the rolling window */
  requestCount: number
  /** Number of distinct paths hit in the rolling window */
  distinctPaths: number
  /** Average inter-request interval in ms (Infinity if only 1 request) */
  avgIntervalMs: number
  /** Whether this IP has triggered any ghost routes */
  hasGhostHit: boolean
}

interface Visit {
  t: number
  path: string
}

interface IpRecord {
  visits: Visit[]          // sorted ascending by t; replaces separate timestamps + paths
  hasGhostHit: boolean
  lastSeen: number         // timestamp of last record() call — used for LRU eviction
}

export interface IpTrackerOptions {
  /** Rolling window in milliseconds. Default: 15 minutes. */
  windowMs?: number
  /**
   * Maximum number of IPs to track simultaneously.
   * When reached, the least-recently-seen IP is evicted.
   * Default: 50,000 (~10 MB at ~200 bytes/record).
   */
  maxEntries?: number
  /**
   * How often (ms) to sweep and remove expired IP records.
   * Pass 0 to disable the automatic sweep (useful in tests).
   * Default: 300,000 ms (5 minutes).
   */
  sweepIntervalMs?: number
}

export class IpTracker {
  private readonly records = new Map<string, IpRecord>()
  private readonly windowMs: number
  private readonly maxEntries: number
  private sweepTimer: ReturnType<typeof setInterval> | null = null

  constructor(options: IpTrackerOptions | number = {}) {
    // Accept a bare number for backwards-compatibility (windowMs shorthand)
    if (typeof options === 'number') {
      this.windowMs = options
      this.maxEntries = DEFAULT_MAX_ENTRIES
    } else {
      this.windowMs = options.windowMs ?? WINDOW_MS
      this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
      const sweepIntervalMs = options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL
      if (sweepIntervalMs > 0) {
        // unref() so the timer doesn't prevent the Node process from exiting
        this.sweepTimer = setInterval(() => this._sweep(), sweepIntervalMs)
        if (typeof this.sweepTimer.unref === 'function') {
          this.sweepTimer.unref()
        }
      }
    }
  }

  /**
   * Record a new request from an IP and return a snapshot of its behaviour.
   * If the IP is new and the tracker is at capacity, the least-recently-seen
   * entry is evicted before inserting.
   */
  record(ip: string, path: string, isGhostHit = false): IpSnapshot {
    const now = Date.now()
    let rec = this.records.get(ip)

    if (!rec) {
      // Enforce max-entries cap before inserting a new entry
      if (this.records.size >= this.maxEntries) {
        this._evictOldest()
      }
      rec = { visits: [], hasGhostHit: false, lastSeen: now }
      this.records.set(ip, rec)
    }

    // Prune visits outside the rolling window — keeps distinctPaths accurate
    const cutoff = now - this.windowMs
    let pruneIdx = 0
    while (pruneIdx < rec.visits.length && (rec.visits[pruneIdx]?.t ?? 0) < cutoff) {
      pruneIdx++
    }
    if (pruneIdx > 0) rec.visits = rec.visits.slice(pruneIdx)

    rec.visits.push({ t: now, path })
    rec.lastSeen = now
    if (isGhostHit) rec.hasGhostHit = true

    return this._snapshot(rec)
  }

  /**
   * Read the current snapshot for an IP without recording a new request.
   */
  peek(ip: string): IpSnapshot {
    const rec = this.records.get(ip)
    if (!rec) return { requestCount: 0, distinctPaths: 0, avgIntervalMs: Infinity, hasGhostHit: false }
    // Prune stale visits before snapshotting so peek() reflects the current window
    const cutoff = Date.now() - this.windowMs
    rec.visits = rec.visits.filter(v => v.t >= cutoff)
    return this._snapshot(rec)
  }

  /**
   * Mark a ghost route hit for the given IP.
   *
   * The membrane middleware cannot observe ghost route hits directly because
   * the app handles them outside the middleware chain. Callers that want the
   * `hasGhostHit` entropy signal should call this after detecting a ghost hit:
   *
   * ```ts
   * // In a custom onSecurityEvent handler or plugin:
   * if (event.type === 'ghost_route_hit') {
   *   myTracker.markGhostHit(ctx.ip)
   * }
   * ```
   *
   * Note: If no record exists for the IP yet (e.g. the ghost hit was the very
   * first request from that IP), a minimal record is created automatically.
   */
  markGhostHit(ip: string): void {
    let rec = this.records.get(ip)
    if (!rec) {
      // Ghost routes run outside the normal middleware chain, so the IP may
      // not have a record yet. Create a minimal stub so hasGhostHit is stored.
      rec = { visits: [], hasGhostHit: false, lastSeen: Date.now() }
      this.records.set(ip, rec)
    }
    rec.hasGhostHit = true
  }

  /** Remove all data for a given IP. */
  evict(ip: string): void {
    this.records.delete(ip)
  }

  /**
   * Stop the periodic sweep timer. Call this when the tracker is no longer
   * needed (e.g. in test teardown or server shutdown) to avoid resource leaks.
   */
  destroy(): void {
    if (this.sweepTimer !== null) {
      clearInterval(this.sweepTimer)
      this.sweepTimer = null
    }
  }

  /** Total number of tracked IPs (informational). */
  get size(): number {
    return this.records.size
  }

  /**
   * Sweep: remove IP records whose last timestamp is outside the rolling window.
   * Called automatically on the sweep interval.
   */
  private _sweep(): void {
    const cutoff = Date.now() - this.windowMs
    for (const [ip, rec] of this.records) {
      if (rec.lastSeen < cutoff) {
        this.records.delete(ip)
      }
    }
  }

  /**
   * Evict the single least-recently-seen entry.
   * Linear scan — called only when at capacity (infrequent).
   */
  private _evictOldest(): void {
    let oldestIp: string | null = null
    let oldestTime = Infinity

    for (const [ip, rec] of this.records) {
      if (rec.lastSeen < oldestTime) {
        oldestTime = rec.lastSeen
        oldestIp = ip
      }
    }

    if (oldestIp !== null) this.records.delete(oldestIp)
  }

  private _snapshot(rec: IpRecord): IpSnapshot {
    const count = rec.visits.length
    let avgIntervalMs = Infinity

    if (count >= 2) {
      const first = rec.visits[0]?.t ?? 0
      const last = rec.visits[count - 1]?.t ?? 0
      avgIntervalMs = (last - first) / (count - 1)
    }

    const distinctPaths = new Set(rec.visits.map(v => v.path)).size

    return {
      requestCount: count,
      distinctPaths,
      avgIntervalMs,
      hasGhostHit: rec.hasGhostHit,
    }
  }
}

/**
 * Shared in-process singleton tracker.
 *
 * WARNING: All `createMembrane()` calls that omit a custom `ipTracker` will
 * share this instance — their IP behaviour data is pooled. This is intentional
 * for single-membrane deployments. If you run multiple independent membrane
 * instances on the same server, pass a dedicated `new IpTracker()` to each.
 */
export const defaultIpTracker = new IpTracker({ sweepIntervalMs: DEFAULT_SWEEP_INTERVAL })
