import type { KairoContext, Middleware } from 'kairo'

export type HardeningAction = 'block' | 'log'

export interface HardeningOptions {
  /**
   * Entropy threshold above which the action fires. [0.0–1.0]
   * Default: 0.75
   */
  threshold?: number

  /**
   * 'block' — reject the request with a 429 and stop the middleware chain.
   * 'log'   — emit a security event and continue (useful as a stepping stone).
   * Default: 'block'
   */
  action?: HardeningAction

  /**
   * HTTP status to send on block. Default: 429.
   */
  status?: number

  /**
   * Response body on block. Defaults to a generic message.
   */
  message?: string

  /**
   * Optional hook called when the threshold is exceeded, regardless of action.
   * Use it to send alerts, push metrics, etc.
   */
  onExceed?: (ctx: KairoContext, entropy: number) => void | Promise<void>
}

/**
 * Active entropy-based request blocking.
 *
 * Place this middleware after createMembrane() so the entropy score is already
 * computed. Requests whose entropy score exceeds `threshold` are either blocked
 * immediately or logged, depending on `action`.
 *
 * ```ts
 * app.use(createMembrane())
 * app.use(createHardening({ threshold: 0.75 }))
 * ```
 */
export function createHardening(options: HardeningOptions = {}): Middleware {
  const threshold = options.threshold ?? 0.75
  const action    = options.action    ?? 'block'
  const status    = options.status    ?? 429
  const message   = options.message   ?? 'Request rejected'

  if (threshold < 0 || threshold > 1) {
    throw new RangeError(`createHardening: threshold must be between 0 and 1, got ${threshold}`)
  }

  return async (ctx: KairoContext, next: () => Promise<void>) => {
    const entropy = ctx.kairo.entropy

    if (entropy >= threshold) {
      // fire the hook regardless of action
      if (options.onExceed) {
        await options.onExceed(ctx, entropy)
      }

      // record the event
      ctx.kairo.events.push({
        type:      'entropy_spike',
        route:     ctx.path,
        detail:    `entropy ${entropy.toFixed(3)} >= threshold ${threshold}`,
        timestamp: Date.now(),
        entropy,
        ip:        ctx.ip,
      })

      if (action === 'block') {
        ctx.json({ error: message }, status)
        return   // do NOT call next()
      }
      // action === 'log' falls through to next()
    }

    await next()
  }
}
