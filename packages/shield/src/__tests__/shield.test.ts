import { describe, it, expect, vi } from 'vitest'
import { createShield } from '../shield.js'
import { createContext, createRequest, createResponse } from '@thekairojs/kairo'
import type { KairoContext } from '@thekairojs/kairo'
import type { IncomingMessage, ServerResponse } from 'node:http'

function makeCtx(): KairoContext {
  const raw = Object.assign(Object.create(null), {
    method: 'GET', url: '/data',
    headers: {}, socket: { remoteAddress: '127.0.0.1' },
  }) as unknown as IncomingMessage
  const rawRes = Object.assign(Object.create(null), {
    headersSent: false, setHeader() {}, writeHead() {}, end() {},
  }) as unknown as ServerResponse
  return createContext(createRequest(raw), createResponse(rawRes), {})
}

// ─── PII detection ────────────────────────────────────────────────────────────

describe('createShield — PII detection', () => {
  it('emits a taint_neutralized event when email is in response body', async () => {
    const ctx = makeCtx()
    await createShield({ pii: true })(ctx, async () => {
      ctx.res.body = JSON.stringify({ contact: 'alice@example.com' })
    })
    expect(ctx.kairo.events.some(e => e.type === 'taint_neutralized')).toBe(true)
  })

  it('does not emit an event when body is clean', async () => {
    const ctx = makeCtx()
    await createShield({ pii: true })(ctx, async () => {
      ctx.res.body = JSON.stringify({ name: 'Alice', age: 30 })
    })
    expect(ctx.kairo.events).toHaveLength(0)
  })

  it('does not scan when pii is false', async () => {
    const ctx = makeCtx()
    await createShield({ pii: false })(ctx, async () => {
      ctx.res.body = JSON.stringify({ email: 'x@y.com' })
    })
    expect(ctx.kairo.events).toHaveLength(0)
  })

  it('detects credit card in response', async () => {
    const ctx = makeCtx()
    await createShield()(ctx, async () => {
      ctx.res.body = JSON.stringify({ card: '4111111111111111' })
    })
    expect(ctx.kairo.events.some(e => e.detail.includes('credit-card'))).toBe(true)
  })
})

// ─── Redaction ────────────────────────────────────────────────────────────────

describe('createShield — redaction', () => {
  it('redacts PII fields when redact is true', async () => {
    const ctx = makeCtx()
    await createShield({ redact: true })(ctx, async () => {
      ctx.res.body = JSON.stringify({ email: 'alice@example.com', name: 'Alice' })
    })
    const body = JSON.parse(ctx.res.body as string) as Record<string, string>
    expect(body['email']).toBe('[REDACTED]')
    expect(body['name']).toBe('Alice')  // untouched
  })

  it('leaves body unchanged when redact is false', async () => {
    const ctx = makeCtx()
    const original = JSON.stringify({ email: 'alice@example.com' })
    await createShield({ redact: false })(ctx, async () => {
      ctx.res.body = original
    })
    expect(ctx.res.body).toBe(original)
  })
})

// ─── Sensitive strings ────────────────────────────────────────────────────────

describe('createShield — sensitiveStrings', () => {
  it('emits an event when a sensitive string appears in body', async () => {
    const ctx = makeCtx()
    await createShield({ sensitiveStrings: ['sk_live_secret'] })(ctx, async () => {
      ctx.res.body = JSON.stringify({ key: 'sk_live_secret_xyz' })
    })
    expect(ctx.kairo.events.some(e => e.type === 'taint_neutralized')).toBe(true)
  })

  it('does not emit when no sensitive strings match', async () => {
    const ctx = makeCtx()
    await createShield({ sensitiveStrings: ['sk_live_secret'] })(ctx, async () => {
      ctx.res.body = JSON.stringify({ result: 'ok' })
    })
    expect(ctx.kairo.events).toHaveLength(0)
  })
})

// ─── onPii hook ───────────────────────────────────────────────────────────────

describe('createShield — onPii hook', () => {
  it('calls onPii when PII is detected', async () => {
    const onPii = vi.fn()
    const ctx = makeCtx()
    await createShield({ onPii })(ctx, async () => {
      ctx.res.body = JSON.stringify({ email: 'x@y.com' })
    })
    expect(onPii).toHaveBeenCalled()
    const [, matches] = onPii.mock.calls[0] as [unknown, { field: string; pattern: string }[]]
    expect(matches.some(m => m.pattern === 'email')).toBe(true)
  })

  it('suppresses event when onPii returns false', async () => {
    const ctx = makeCtx()
    await createShield({ onPii: () => false })(ctx, async () => {
      ctx.res.body = JSON.stringify({ email: 'x@y.com' })
    })
    expect(ctx.kairo.events).toHaveLength(0)
  })
})

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('createShield — edge cases', () => {
  it('skips scan when body is null', async () => {
    const ctx = makeCtx()
    await createShield()(ctx, async () => { ctx.res.body = null })
    expect(ctx.kairo.events).toHaveLength(0)
  })

  it('skips scan when body is not valid JSON string', async () => {
    const ctx = makeCtx()
    await createShield()(ctx, async () => { ctx.res.body = 'plain text response' })
    expect(ctx.kairo.events).toHaveLength(0)
  })

  it('always calls next()', async () => {
    const next = vi.fn().mockResolvedValue(undefined)
    await createShield()(makeCtx(), next)
    expect(next).toHaveBeenCalled()
  })
})
