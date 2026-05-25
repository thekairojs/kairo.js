import type { KairoContext, Middleware } from 'kairo'
import { scanForPii } from './patterns.js'

export interface ShieldOptions {
  /**
   * Scan response bodies for PII patterns (email, SSN, credit card, etc.)
   * When a match is found a security event is emitted and optionally the
   * response is redacted. Default: true
   */
  pii?: boolean

  /**
   * When true, fields containing PII are replaced with "[REDACTED]" in the
   * response. Default: false — detection only, no mutation.
   */
  redact?: boolean

  /**
   * Called when PII is found. Return false to suppress the default event emission.
   */
  onPii?: (ctx: KairoContext, matches: { field: string; pattern: string }[]) => boolean | void

  /**
   * Additional string patterns to look for in responses (e.g. API keys, tenant IDs).
   * Each string is treated as a substring match against JSON-serialized body.
   */
  sensitiveStrings?: string[]
}

/**
 * Data Shield — scans outbound response bodies for PII and sensitive strings.
 *
 * Place this middleware at the top of the chain. It runs its scan *after*
 * next() returns, so the handler has already set ctx.res.body.
 *
 * ```ts
 * app.use(createShield({ pii: true }))
 * app.use(createMembrane())
 * app.get('/users/:id', handler)
 * ```
 */
export function createShield(options: ShieldOptions = {}): Middleware {
  const scanPii     = options.pii     ?? true
  const redact      = options.redact  ?? false
  const sensitives  = options.sensitiveStrings ?? []

  return async (ctx: KairoContext, next: () => Promise<void>) => {
    await next()

    const body = ctx.res.body
    if (body === undefined || body === null) return

    // Parse body — only JSON bodies are scanned
    let parsed: unknown
    if (typeof body === 'string') {
      try { parsed = JSON.parse(body) } catch { return }
    } else {
      parsed = body
    }

    // ── PII scan ──────────────────────────────────────────────────────────
    if (scanPii && parsed !== null) {
      const matches = scanForPii(parsed)
      if (matches.length > 0) {
        const suppress = options.onPii?.(ctx, matches)

        if (suppress !== false) {
          ctx.kairo.events.push({
            type:      'taint_neutralized',
            route:     ctx.path,
            detail:    `pii in response: ${matches.map(m => `${m.field}(${m.pattern})`).join(', ')}`,
            timestamp: Date.now(),
            entropy:   ctx.kairo.entropy,
            ip:        ctx.ip,
          })
        }

        if (redact) {
          const redacted = redactPii(parsed, new Set(matches.map(m => m.field)))
          ctx.res.body = JSON.stringify(redacted)
        }
      }
    }

    // ── Sensitive string scan ─────────────────────────────────────────────
    if (sensitives.length > 0) {
      const serialized = typeof body === 'string' ? body : JSON.stringify(body)
      const found = sensitives.filter(s => serialized.includes(s))
      if (found.length > 0) {
        ctx.kairo.events.push({
          type:      'taint_neutralized',
          route:     ctx.path,
          detail:    `sensitive strings in response: ${found.map(s => s.slice(0, 8)).join(', ')}`,
          timestamp: Date.now(),
          entropy:   ctx.kairo.entropy,
          ip:        ctx.ip,
        })
      }
    }
  }
}

// ─── Redaction ────────────────────────────────────────────────────────────────

function redactPii(obj: unknown, fields: Set<string>, path = ''): unknown {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'string') {
    return fields.has(path) ? '[REDACTED]' : obj
  }
  if (typeof obj !== 'object') return obj

  if (Array.isArray(obj)) {
    return (obj as unknown[]).map((item, i) => redactPii(item, fields, `${path}[${i}]`))
  }

  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const childPath = path ? `${path}.${k}` : k
    out[k] = redactPii(v, fields, childPath)
  }
  return out
}
