/**
 * Entropy Scoring Engine — composites multiple anomaly signals into a
 * single per-request score in [0.0, 1.0].
 *
 * Higher score = more anomalous. The score is stored on ctx.kairo.entropy.
 * It is advisory — the framework never blocks based on entropy alone in Phase 2.
 * Enforcement layers (Trust Lattice, Runtime Sentinel) consume the score.
 *
 * Design principles:
 * - Deterministic given the same inputs (no randomness)
 * - Always returns a finite number in [0.0, 1.0] — no NaN, no Infinity
 * - Additive contributions; each component is clamped before summing
 * - Fast (< 1 ms per request) — no I/O, no regex backtracking on large payloads
 */

import { fingerprintHeaders, type FingerprintResult } from './fingerprint.js'
import type { IpSnapshot } from './ip-tracker.js'

export interface EntropyInput {
  /** HTTP method of the incoming request */
  method: string
  /** Decoded path (no query string) */
  path: string
  /** Raw request headers */
  headers: Readonly<Record<string, string | string[] | undefined>>
  /** Content-Type of the request body (empty string if none) */
  contentType: string
  /** Raw body length in bytes (-1 if not available) */
  bodyLength: number
  /** Body depth — max nesting depth for JSON bodies (-1 if not parsed) */
  bodyDepth: number
  /** IP behaviour snapshot from the rolling-window tracker */
  ipSnapshot: IpSnapshot
  /** Whether the server trusts X-Forwarded-For */
  trustProxy: boolean
}

export interface EntropyResult {
  /** Composite score [0.0, 1.0] — always finite */
  score: number
  /** Breakdown by component for observability */
  components: {
    header: number
    ipBehavior: number
    payload: number
    timing: number
  }
  /** All signals that contributed to the score */
  signals: string[]
}

/**
 * Compute the entropy score for a request.
 * This function is pure — no side effects, no I/O.
 */
export function computeEntropy(input: EntropyInput): EntropyResult {
  const signals: string[] = []

  // ── 1. Header fingerprint score ───────────────────────────────────────────
  const headerResult: FingerprintResult = fingerprintHeaders(input.headers, input.trustProxy)
  const headerScore = clamp(headerResult.score)
  signals.push(...headerResult.signals)

  // ── 2. IP behavioural score ───────────────────────────────────────────────
  let ipScore = 0
  const snap = input.ipSnapshot

  if (snap.requestCount >= 200) {
    ipScore += 0.50
    signals.push(`ip high request rate: ${snap.requestCount} in 15min`)
  } else if (snap.requestCount >= 100) {
    ipScore += 0.35
    signals.push(`ip elevated request rate: ${snap.requestCount} in 15min`)
  } else if (snap.requestCount >= 50) {
    ipScore += 0.20
    signals.push(`ip moderate request rate: ${snap.requestCount} in 15min`)
  } else if (snap.requestCount >= 20) {
    ipScore += 0.08
    signals.push(`ip slightly elevated request rate: ${snap.requestCount} in 15min`)
  }

  if (snap.distinctPaths >= 50) {
    ipScore += 0.30
    signals.push(`ip crawling wide path range: ${snap.distinctPaths} distinct paths`)
  } else if (snap.distinctPaths >= 20) {
    ipScore += 0.15
    signals.push(`ip visiting many distinct paths: ${snap.distinctPaths}`)
  } else if (snap.distinctPaths >= 10) {
    ipScore += 0.05
    signals.push(`ip visiting elevated distinct paths: ${snap.distinctPaths}`)
  }

  if (snap.hasGhostHit) {
    ipScore += 0.40
    signals.push('ip previously triggered ghost route')
  }

  // Very rapid fire (avg interval < 100ms) suggests non-human automation
  if (snap.avgIntervalMs < 100 && snap.requestCount > 5) {
    ipScore += 0.25
    signals.push(`ip rapid-fire requests: avg interval ${snap.avgIntervalMs.toFixed(0)}ms`)
  } else if (snap.avgIntervalMs < 500 && snap.requestCount > 10) {
    ipScore += 0.10
    signals.push(`ip fast request rate: avg interval ${snap.avgIntervalMs.toFixed(0)}ms`)
  }

  const ipBehaviorScore = clamp(ipScore)

  // ── 3. Payload structure score ────────────────────────────────────────────
  let payloadScore = 0

  // Deeply nested JSON is a common vector for DoS and injection
  if (input.bodyDepth > 20) {
    payloadScore += 0.40
    signals.push(`deeply nested payload: depth ${input.bodyDepth}`)
  } else if (input.bodyDepth > 10) {
    payloadScore += 0.20
    signals.push(`elevated payload depth: ${input.bodyDepth}`)
  }

  // Very large body approaching the limit
  if (input.bodyLength > 900_000) {
    payloadScore += 0.15
    signals.push(`near-limit body size: ${input.bodyLength} bytes`)
  } else if (input.bodyLength > 500_000) {
    payloadScore += 0.05
    signals.push(`large body size: ${input.bodyLength} bytes`)
  }

  // Suspicious content-type mismatch or unusual types
  const ct = input.contentType.toLowerCase()
  if (ct && !ct.includes('application/json') && !ct.includes('application/x-www-form-urlencoded')
      && !ct.includes('text/plain') && !ct.includes('multipart/form-data') && ct !== '') {
    payloadScore += 0.08
    signals.push(`unusual content-type: ${input.contentType}`)
  }

  const payloadStructureScore = clamp(payloadScore)

  // ── 4. Timing / path heuristic score ─────────────────────────────────────
  let timingScore = 0

  // Paths that look like common injection probes
  const pathLower = input.path.toLowerCase()
  if (
    pathLower.includes('..') ||          // path traversal
    pathLower.includes('%2e%2e') ||       // encoded traversal
    pathLower.includes('<') ||            // XSS attempt in path
    pathLower.includes('>') ||
    pathLower.includes("'") ||            // SQL injection probe
    pathLower.includes('union+select') || // SQL injection
    pathLower.includes('union%20select') ||
    pathLower.includes('/etc/passwd') ||
    pathLower.includes('/proc/self')
  ) {
    timingScore += 0.45
    signals.push('injection probe pattern detected in path')
  }

  // OPTIONS or TRACE on non-root path — method enumeration
  if ((input.method === 'TRACE') ||
      (input.method === 'CONNECT')) {
    timingScore += 0.25
    signals.push(`unusual HTTP method: ${input.method}`)
  }

  const timingScore_ = clamp(timingScore)

  // ── Composite: weighted sum of all components ─────────────────────────────
  // Weights sum to 1.0 — tune as more data is gathered post-launch
  const composite =
    headerScore    * 0.30 +
    ipBehaviorScore * 0.35 +
    payloadStructureScore * 0.20 +
    timingScore_    * 0.15

  return {
    score: clamp(composite),
    components: {
      header: headerScore,
      ipBehavior: ipBehaviorScore,
      payload: payloadStructureScore,
      timing: timingScore_,
    },
    signals,
  }
}

/**
 * Measure maximum nesting depth of a parsed JSON value.
 * Returns 0 for non-objects/arrays. Capped at 50 to avoid stack overflow.
 */
export function measureJsonDepth(value: unknown, limit = 50): number {
  // When limit is exhausted we return 0 — the caller above adds 1, so the
  // effective cap on the returned depth is exactly `limit`. If we returned
  // `limit` here instead, every ancestor would add 1 more and the total would
  // overshoot (e.g. 60-deep input with limit=50 would return ~100).
  if (limit <= 0) return 0
  if (value === null || typeof value !== 'object') return 0
  const obj = value as Record<string, unknown> | unknown[]
  if (Array.isArray(obj)) {
    let max = 0
    for (const item of obj) {
      const d = measureJsonDepth(item, limit - 1)
      if (d > max) max = d
    }
    return max + 1
  }
  let max = 0
  for (const v of Object.values(obj)) {
    const d = measureJsonDepth(v, limit - 1)
    if (d > max) max = d
  }
  return max + 1
}

/** Clamp a number to [0, 1] and guard against NaN / Infinity. */
function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}
