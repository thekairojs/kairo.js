import { describe, it, expect, vi } from 'vitest'
import { createHardening } from '../hardening.js'
import { createContext, createRequest, createResponse } from 'kairo'
import type { KairoContext, SecurityEvent } from 'kairo'
import type { IncomingMessage, ServerResponse } from 'node:http'

function makeCtx(entropy = 0.0): KairoContext {
  const raw = Object.assign(Object.create(null), {
    method: 'GET', url: '/test',
    headers: {}, socket: { remoteAddress: '127.0.0.1' },
  }) as unknown as IncomingMessage
  const rawRes = Object.assign(Object.create(null), {
    headersSent: false, setHeader() {}, writeHead() {}, end() {},
  }) as unknown as ServerResponse
  const ctx = createContext(createRequest(raw), createResponse(rawRes), {})
  ctx.kairo.entropy = entropy
  return ctx
}

function noop(): Promise<void> { return Promise.resolve() }

// ─── Basic blocking ───────────────────────────────────────────────────────────

describe('createHardening — blocking', () => {
  it('calls next() when entropy is below threshold', async () => {
    const next = vi.fn().mockResolvedValue(undefined)
    await createHardening({ threshold: 0.75 })(makeCtx(0.5), next)
    expect(next).toHaveBeenCalled()
  })

  it('does not call next() when entropy meets threshold (block mode)', async () => {
    const next = vi.fn()
    await createHardening({ threshold: 0.75 })(makeCtx(0.75), next)
    expect(next).not.toHaveBeenCalled()
  })

  it('does not call next() when entropy exceeds threshold', async () => {
    const next = vi.fn()
    await createHardening({ threshold: 0.5 })(makeCtx(0.9), next)
    expect(next).not.toHaveBeenCalled()
  })

  it('sends the configured status code on block', async () => {
    const ctx = makeCtx(0.9)
    const jsonSpy = vi.spyOn(ctx, 'json')
    await createHardening({ threshold: 0.5, status: 403 })(ctx, noop)
    expect(jsonSpy).toHaveBeenCalledWith(expect.anything(), 403)
  })

  it('sends 429 by default on block', async () => {
    const ctx = makeCtx(0.9)
    const jsonSpy = vi.spyOn(ctx, 'json')
    await createHardening({ threshold: 0.5 })(ctx, noop)
    expect(jsonSpy).toHaveBeenCalledWith(expect.anything(), 429)
  })

  it('does NOT expose entropy score in the block response body (information disclosure)', async () => {
    const ctx = makeCtx(0.9)
    const jsonSpy = vi.spyOn(ctx, 'json')
    await createHardening({ threshold: 0.5 })(ctx, noop)
    const body = jsonSpy.mock.calls[0]?.[0] as Record<string, unknown>
    expect(body['entropy']).toBeUndefined()
    expect(body['error']).toBeDefined()
  })

  it('uses a custom message when provided', async () => {
    const ctx = makeCtx(0.9)
    const jsonSpy = vi.spyOn(ctx, 'json')
    await createHardening({ threshold: 0.5, message: 'Go away' })(ctx, noop)
    const body = jsonSpy.mock.calls[0]?.[0] as { error: string }
    expect(body.error).toBe('Go away')
  })
})

// ─── Log mode ─────────────────────────────────────────────────────────────────

describe('createHardening — log mode', () => {
  it('calls next() even when entropy exceeds threshold in log mode', async () => {
    const next = vi.fn().mockResolvedValue(undefined)
    await createHardening({ threshold: 0.5, action: 'log' })(makeCtx(0.9), next)
    expect(next).toHaveBeenCalled()
  })

  it('still emits an entropy_spike event in log mode', async () => {
    const ctx = makeCtx(0.9)
    await createHardening({ threshold: 0.5, action: 'log' })(ctx, noop)
    expect(ctx.kairo.events.some((e: SecurityEvent) => e.type === 'entropy_spike')).toBe(true)
  })
})

// ─── Security event ───────────────────────────────────────────────────────────

describe('createHardening — security events', () => {
  it('emits entropy_spike event on block', async () => {
    const ctx = makeCtx(0.8)
    await createHardening({ threshold: 0.5 })(ctx, noop)
    const event = ctx.kairo.events.find((e: SecurityEvent) => e.type === 'entropy_spike')
    expect(event).toBeDefined()
    expect(event?.entropy).toBeCloseTo(0.8)
  })

  it('does not emit an event below threshold', async () => {
    const ctx = makeCtx(0.3)
    await createHardening({ threshold: 0.75 })(ctx, noop)
    expect(ctx.kairo.events).toHaveLength(0)
  })
})

// ─── onExceed hook ────────────────────────────────────────────────────────────

describe('createHardening — onExceed hook', () => {
  it('calls onExceed when entropy exceeds threshold', async () => {
    const onExceed = vi.fn()
    const ctx = makeCtx(0.9)
    await createHardening({ threshold: 0.5, onExceed })(ctx, noop)
    expect(onExceed).toHaveBeenCalledWith(ctx, expect.closeTo(0.9, 1))
  })

  it('calls onExceed in log mode too', async () => {
    const onExceed = vi.fn()
    const ctx = makeCtx(0.9)
    await createHardening({ threshold: 0.5, action: 'log', onExceed })(ctx, noop)
    expect(onExceed).toHaveBeenCalled()
  })

  it('does not call onExceed below threshold', async () => {
    const onExceed = vi.fn()
    const ctx = makeCtx(0.3)
    await createHardening({ threshold: 0.75, onExceed })(ctx, noop)
    expect(onExceed).not.toHaveBeenCalled()
  })
})

// ─── Config validation ────────────────────────────────────────────────────────

describe('createHardening — config validation', () => {
  it('throws when threshold is below 0', () => {
    expect(() => createHardening({ threshold: -0.1 })).toThrow(RangeError)
  })

  it('throws when threshold is above 1', () => {
    expect(() => createHardening({ threshold: 1.1 })).toThrow(RangeError)
  })

  it('accepts threshold of exactly 0', () => {
    expect(() => createHardening({ threshold: 0 })).not.toThrow()
  })

  it('accepts threshold of exactly 1', () => {
    expect(() => createHardening({ threshold: 1 })).not.toThrow()
  })
})

// ─── Default behaviour ────────────────────────────────────────────────────────

describe('createHardening — defaults', () => {
  it('uses 0.75 as the default threshold', async () => {
    const next = vi.fn().mockResolvedValue(undefined)
    await createHardening()(makeCtx(0.74), next)
    expect(next).toHaveBeenCalled()

    const next2 = vi.fn()
    await createHardening()(makeCtx(0.75), next2)
    expect(next2).not.toHaveBeenCalled()
  })
})
