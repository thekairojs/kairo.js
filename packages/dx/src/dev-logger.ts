import type { KairoContext, Middleware } from '@thekairojs/kairo'

export interface DevLoggerOptions {
  /**
   * When false the middleware is a transparent pass-through.
   * Default: process.env.NODE_ENV !== 'production'
   */
  enabled?: boolean
  /**
   * Override the output sink. Useful in tests to capture output without
   * mocking console. Defaults to console.log.
   */
  write?: (line: string) => void
}

interface EntropyDetail {
  components?: { header: number; ipBehavior: number; payload: number; timing: number }
  signals?: string[]
}

/**
 * Per-request security diagnostics for local development.
 *
 * Logs a structured summary after each request: entropy score, active signals,
 * security events, tainted input paths, and resolved lattice claims.
 *
 * Enable membrane's `exposeDetail: true` option to also see the component
 * breakdown (header / ip / payload / timing).
 *
 * ```ts
 * app.use(devLogger())
 * app.use(createMembrane({ exposeDetail: true }))
 * ```
 */
export function devLogger(options: DevLoggerOptions = {}): Middleware {
  const enabled = options.enabled ?? process.env['NODE_ENV'] !== 'production'
  const write = options.write ?? ((line: string) => console.log(line))

  if (!enabled) {
    return (_ctx: KairoContext, next: () => Promise<void>) => next()
  }

  return async (ctx: KairoContext, next: () => Promise<void>) => {
    const start = Date.now()
    await next()
    const ms = Date.now() - start

    const { method, path, res, kairo } = ctx
    const status = res.statusCode
    const entropy = kairo.entropy.toFixed(3)

    // Entropy breakdown — only present when membrane exposeDetail is true
    const detail = ctx.state['kairo.entropy.detail'] as EntropyDetail | undefined

    write(`[kairo] ${method} ${path} — ${status} — ${ms}ms`)

    if (detail?.components) {
      const c = detail.components
      write(
        `  entropy: ${entropy}` +
        ` | header: ${c.header.toFixed(2)}` +
        ` | ip: ${c.ipBehavior.toFixed(2)}` +
        ` | payload: ${c.payload.toFixed(2)}` +
        ` | timing: ${c.timing.toFixed(2)}`,
      )
    } else {
      write(`  entropy: ${entropy}`)
    }

    if (detail?.signals?.length) {
      write(`  signals: ${detail.signals.join('; ')}`)
    }

    if (kairo.events.length > 0) {
      write(`  events:  ${kairo.events.map(e => e.type).join(', ')}`)
    } else {
      write(`  events:  none`)
    }

    const taintedList = [...kairo.taintedPaths].slice(0, 12).join(', ')
    write(`  tainted: ${taintedList || 'none'}`)

    if (kairo.lattice.resolved) {
      const { claims } = kairo.lattice
      const roles = claims?.roles.length ? claims.roles.join(', ') : '—'
      write(`  lattice: ${claims?.level} / ${claims?.subject ?? 'anon'} / [${roles}]`)
    } else {
      write(`  lattice: unresolved`)
    }
  }
}
