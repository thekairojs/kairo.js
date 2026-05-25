import type { KairoContext, Middleware } from '@thekairojs/kairo'
import { emitSecurityEvent } from '@thekairojs/kairo'
import { classify } from './classify.js'

export interface IntentOptions {
  /**
   * When true, elevates entropy on scanner or unknown intent.
   * Default: true
   */
  elevateEntropy?: boolean

  /**
   * Entropy added per scanner signal detected. Default: 0.15
   */
  scannerEntropyDelta?: number

  /**
   * Called after classification if provided. Useful for logging or overriding.
   */
  onClassified?: (ctx: KairoContext, type: string, confidence: number) => void
}

/**
 * Intent Engine — classifies request origin as human / api / bot / scanner.
 *
 * Reads User-Agent, Accept, Cookie, Authorization, and path. Writes the
 * result to ctx.kairo.intent. Optionally elevates entropy for scanner traffic.
 *
 * ```ts
 * app.use(createMembrane())
 * app.use(createIntent())
 * ```
 */
export function createIntent(options: IntentOptions = {}): Middleware {
  const elevate = options.elevateEntropy ?? true
  const delta   = options.scannerEntropyDelta ?? 0.15

  return async (ctx: KairoContext, next: () => Promise<void>) => {
    const ua      = ctx.headers['user-agent'] as string | undefined
    const accepts = ctx.headers['accept']     as string | undefined
    const auth    = ctx.headers['authorization']
    const cookies = ctx.headers['cookie']

    const result = classify({
      ua,
      path:       ctx.path,
      accepts,
      method:     ctx.method,
      hasAuth:    !!auth,
      hasCookies: !!cookies,
    })

    ctx.kairo.intent = {
      type:       result.type,
      confidence: result.confidence,
      signals:    result.signals,
      resolved:   true,
    }

    if (elevate && (result.type === 'scanner' || (result.type === 'unknown' && result.signals.some(s => s.includes('probe'))))) {
      ctx.kairo.entropy = Math.min(1.0, ctx.kairo.entropy + delta * result.confidence)
    }

    if (result.type === 'scanner' || result.type === 'bot') {
      emitSecurityEvent(ctx, {
        type:   'intent_drift',
        route:  ctx.path,
        detail: `classified as ${result.type} (confidence ${result.confidence.toFixed(2)}): ${result.signals.join('; ')}`,
      })
    }

    if (options.onClassified) {
      options.onClassified(ctx, result.type, result.confidence)
    }

    await next()
  }
}
