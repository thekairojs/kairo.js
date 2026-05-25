import { describe, it, expect, vi } from 'vitest'
import { createIntent } from '../intent.js'
import { createContext, createRequest, createResponse } from 'kairo'
import type { KairoContext } from 'kairo'
import type { IncomingMessage, ServerResponse } from 'node:http'

function makeCtx(headers: Record<string, string> = {}, path = '/api/data'): KairoContext {
  const raw = Object.assign(Object.create(null), {
    method: 'GET', url: path,
    headers, socket: { remoteAddress: '127.0.0.1' },
  }) as unknown as IncomingMessage
  const rawRes = Object.assign(Object.create(null), {
    headersSent: false, setHeader() {}, writeHead() {}, end() {},
  }) as unknown as ServerResponse
  return createContext(createRequest(raw), createResponse(rawRes), {})
}

function noop(): Promise<void> { return Promise.resolve() }

// ─── Classification written to context ────────────────────────────────────────

describe('createIntent — context enrichment', () => {
  it('sets ctx.kairo.intent.resolved to true after running', async () => {
    const ctx = makeCtx({ 'user-agent': 'Mozilla/5.0', accept: 'text/html' })
    await createIntent()(ctx, noop)
    expect(ctx.kairo.intent.resolved).toBe(true)
  })

  it('classifies a browser as human', async () => {
    const ctx = makeCtx({
      'user-agent': 'Mozilla/5.0 (compatible)',
      accept: 'text/html,application/xhtml+xml',
      cookie: 'session=abc',
    })
    await createIntent()(ctx, noop)
    expect(ctx.kairo.intent.type).toBe('human')
  })

  it('classifies sqlmap as scanner', async () => {
    const ctx = makeCtx({ 'user-agent': 'sqlmap/1.7.8' })
    await createIntent()(ctx, noop)
    expect(ctx.kairo.intent.type).toBe('scanner')
  })

  it('classifies googlebot as bot', async () => {
    const ctx = makeCtx({ 'user-agent': 'Googlebot/2.1' })
    await createIntent()(ctx, noop)
    expect(ctx.kairo.intent.type).toBe('bot')
  })
})

// ─── Entropy elevation ────────────────────────────────────────────────────────

describe('createIntent — entropy elevation', () => {
  it('elevates entropy for scanner traffic', async () => {
    const ctx = makeCtx({ 'user-agent': 'sqlmap/1.7' })
    await createIntent({ elevateEntropy: true })(ctx, noop)
    expect(ctx.kairo.entropy).toBeGreaterThan(0)
  })

  it('does not elevate entropy for human traffic', async () => {
    const ctx = makeCtx({
      'user-agent': 'Mozilla/5.0',
      accept: 'text/html',
      cookie: 'sid=1',
    })
    ctx.kairo.entropy = 0.1
    await createIntent({ elevateEntropy: true })(ctx, noop)
    expect(ctx.kairo.entropy).toBe(0.1)
  })

  it('skips elevation when elevateEntropy is false', async () => {
    const ctx = makeCtx({ 'user-agent': 'sqlmap/1.7' })
    await createIntent({ elevateEntropy: false })(ctx, noop)
    expect(ctx.kairo.entropy).toBe(0)
  })

  it('caps entropy at 1.0', async () => {
    const ctx = makeCtx({ 'user-agent': 'sqlmap/1.7' })
    ctx.kairo.entropy = 0.99
    await createIntent()(ctx, noop)
    expect(ctx.kairo.entropy).toBeLessThanOrEqual(1.0)
  })
})

// ─── Security events ──────────────────────────────────────────────────────────

describe('createIntent — security events', () => {
  it('emits intent_drift event for scanner traffic', async () => {
    const ctx = makeCtx({ 'user-agent': 'nikto/2.1' })
    await createIntent()(ctx, noop)
    expect(ctx.kairo.events.some(e => e.type === 'intent_drift')).toBe(true)
  })

  it('emits intent_drift event for bot traffic', async () => {
    const ctx = makeCtx({ 'user-agent': 'Googlebot/2.1' })
    await createIntent()(ctx, noop)
    const event = ctx.kairo.events.find(e => e.type === 'intent_drift')
    expect(event).toBeDefined()
    expect(event?.detail).toContain('bot')
  })

  it('intent_drift event carries the client IP', async () => {
    const ctx = makeCtx({ 'user-agent': 'nikto/2.1' })
    await createIntent()(ctx, noop)
    const event = ctx.kairo.events.find(e => e.type === 'intent_drift')
    expect(event?.ip).toBe('127.0.0.1')
  })

  it('does not emit intent_drift for human traffic', async () => {
    const ctx = makeCtx({ 'user-agent': 'Mozilla/5.0', accept: 'text/html' })
    await createIntent()(ctx, noop)
    expect(ctx.kairo.events.some(e => e.type === 'intent_drift')).toBe(false)
  })
})

// ─── onClassified hook ────────────────────────────────────────────────────────

describe('createIntent — onClassified hook', () => {
  it('calls the hook with type and confidence', async () => {
    const onClassified = vi.fn()
    const ctx = makeCtx({ 'user-agent': 'Googlebot' })
    await createIntent({ onClassified })(ctx, noop)
    expect(onClassified).toHaveBeenCalledWith(ctx, 'bot', expect.any(Number))
  })
})

// ─── Middleware chain ─────────────────────────────────────────────────────────

describe('createIntent — middleware chain', () => {
  it('always calls next()', async () => {
    const next = vi.fn().mockResolvedValue(undefined)
    const ctx = makeCtx({ 'user-agent': 'sqlmap/1.7' })
    await createIntent()(ctx, next)
    expect(next).toHaveBeenCalled()
  })
})
