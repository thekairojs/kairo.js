/**
 * Request Membrane — the first security layer in the KAIRO 7-layer architecture.
 *
 * Responsibilities (in order, per request):
 * 1. Record IP behaviour in the rolling-window tracker
 * 2. Fingerprint headers for anomaly signals
 * 3. Compute composite entropy score (0.0–1.0) and write to ctx.kairo.entropy
 * 4. Propagate taint markers for all user-controlled inputs
 * 5. Optionally emit a SecurityEvent if entropy exceeds a threshold
 *
 * The membrane never blocks requests — it is an observation + annotation layer.
 * Enforcement belongs in Trust Lattice and Runtime Sentinel (Phases 3-4).
 *
 * ── Ghost route → IP tracker wiring ─────────────────────────────────────────
 * Ghost route hits are handled by the app outside the middleware chain, so the
 * membrane cannot automatically update hasGhostHit. Wire it via onSecurityEvent:
 *
 * ```ts
 * const tracker = new IpTracker()
 * app.use(createMembrane({ ipTracker: tracker }))
 *
 * app.use({
 *   name: 'ghost-tracker', version: '1.0.0',
 *   onSecurityEvent: (event) => {
 *     if (event.type === 'ghost_route_hit') {
 *       tracker.markGhostHit(event.ip)
 *     }
 *   }
 * })
 * ```
 */

import type { KairoContext, KairoPlugin, Middleware } from 'kairo'
import { emitSecurityEvent } from 'kairo'
import { computeEntropy, measureJsonDepth, type EntropyResult } from './entropy.js'
import { defaultIpTracker, IpTracker } from './ip-tracker.js'
import { propagateTaint } from './taint.js'

export interface MembraneOptions {
  /**
   * Emit a SecurityEvent when entropy crosses this threshold [0.0–1.0].
   * Set to 1.0 to disable threshold events entirely. Default: 0.7
   */
  entropyEventThreshold?: number

  /**
   * Provide a custom IpTracker instance (e.g. for testing or scoped tracking).
   *
   * Defaults to the shared in-process singleton `defaultIpTracker`. All
   * membrane instances that use the default tracker pool their IP behaviour
   * data — this is intentional for single-membrane deployments. Pass a
   * dedicated `new IpTracker()` if you need isolated tracking.
   */
  ipTracker?: IpTracker

  /**
   * Whether the server trusts X-Forwarded-For for IP extraction.
   * Must match the trustProxy setting on the KairoApp instance. Default: false
   */
  trustProxy?: boolean

  /**
   * Attach the full EntropyResult breakdown to `ctx.state['kairo.entropy.detail']`.
   * Useful for debug logging middleware. Default: false
   */
  exposeDetail?: boolean
}

/**
 * Create a Membrane Kairo plugin.
 *
 * Usage (as a plugin):
 * ```ts
 * import { createMembrane } from 'kairo-membrane'
 * app.use(createMembrane({ entropyEventThreshold: 0.6 }))
 * ```
 *
 * Usage (as raw middleware):
 * ```ts
 * import { createMembraneMiddleware } from 'kairo-membrane'
 * app.use(createMembraneMiddleware({ ... }))
 * ```
 */
export function createMembrane(options: MembraneOptions = {}): KairoPlugin {
  const mw = createMembraneMiddleware(options)

  return {
    name: 'kairo-membrane',
    version: '0.1.0',
    onRequest: mw,
  }
}

/**
 * Returns just the middleware function — useful when you want the membrane
 * logic without the plugin wrapper.
 */
export function createMembraneMiddleware(options: MembraneOptions = {}): Middleware {
  const threshold = options.entropyEventThreshold ?? 0.7
  const tracker = options.ipTracker ?? defaultIpTracker
  const trustProxy = options.trustProxy ?? false
  const exposeDetail = options.exposeDetail ?? false

  return async (ctx: KairoContext, next: () => Promise<void>) => {
    // ── 1. Measure body characteristics ──────────────────────────────────────
    // Body is only available here if it was parsed before this middleware ran
    // (e.g. the framework parses it for POST/PUT/PATCH before the chain fires).
    // For GET/HEAD/DELETE, rawBody is always undefined.
    const rawBody = ctx.body
    let bodyLength = -1
    let bodyDepth = -1

    if (typeof rawBody === 'string') {
      bodyLength = Buffer.byteLength(rawBody, 'utf8')
    } else if (Buffer.isBuffer(rawBody)) {
      bodyLength = rawBody.length
    } else if (rawBody !== null && rawBody !== undefined) {
      // Parsed JSON object — use Content-Length header if available
      const cl = ctx.headers['content-length']
      if (typeof cl === 'string') {
        const n = parseInt(cl, 10)
        if (Number.isFinite(n) && n >= 0) bodyLength = n
      }
    }

    if (rawBody !== null && rawBody !== undefined && typeof rawBody === 'object' && !Buffer.isBuffer(rawBody)) {
      bodyDepth = measureJsonDepth(rawBody)
    } else if (typeof rawBody === 'string') {
      // Try to measure depth of a raw JSON string body
      try {
        const parsed: unknown = JSON.parse(rawBody)
        bodyDepth = measureJsonDepth(parsed)
      } catch {
        bodyDepth = 0
      }
    }

    const contentType = typeof ctx.headers['content-type'] === 'string'
      ? ctx.headers['content-type']
      : ''

    // ── 2. Record IP behaviour & get snapshot ─────────────────────────────────
    // isGhostHit is always false here — the membrane cannot observe ghost route
    // hits because they bypass the middleware chain. See module-level JSDoc for
    // how to wire ghost hits manually.
    const ipSnapshot = tracker.record(ctx.ip, ctx.path, false)

    // ── 3. Compute entropy score ──────────────────────────────────────────────
    const result: EntropyResult = computeEntropy({
      method: ctx.method,
      path: ctx.path,
      headers: ctx.headers,
      contentType,
      bodyLength,
      bodyDepth,
      ipSnapshot,
      trustProxy,
    })

    // Merge with any entropy already set (e.g. from a prior plugin run)
    ctx.kairo.entropy = Math.min(ctx.kairo.entropy + result.score, 1.0)

    // Expose detailed breakdown if requested
    if (exposeDetail) {
      ctx.state['kairo.entropy.detail'] = result
    }

    // ── 4. Propagate taint markers ────────────────────────────────────────────
    propagateTaint(ctx)

    // ── 5. Emit SecurityEvent if entropy threshold exceeded ───────────────────
    if (ctx.kairo.entropy >= threshold) {
      ctx.kairo.hardeningActive = true
      emitSecurityEvent(ctx, {
        type: 'entropy_spike',
        route: ctx.path,
        detail: `Entropy ${ctx.kairo.entropy.toFixed(3)} ≥ threshold ${threshold}. Signals: ${result.signals.join('; ') || 'none'}`,
      })
    }

    await next()
  }
}
