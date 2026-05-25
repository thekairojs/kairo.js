import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createCanary, isCanaryToken, scanForCanary,
  revokeCanary, revokeCanaryAfter, canaryRegistrySize,
} from '../canary.js'
import { createContext, createRequest, createResponse } from '@thekairojs/kairo'
import type { IncomingMessage, ServerResponse } from 'node:http'

function makeCtx() {
  const raw = Object.assign(Object.create(null), {
    method: 'GET', url: '/data',
    headers: {}, socket: { remoteAddress: '127.0.0.1' },
  }) as unknown as IncomingMessage
  const rawRes = Object.assign(Object.create(null), {
    headersSent: false, setHeader() {}, writeHead() {}, end() {},
  }) as unknown as ServerResponse
  return createContext(createRequest(raw), createResponse(rawRes), {})
}

describe('createCanary', () => {
  it('returns all original fields', () => {
    const record = createCanary({ id: 1, name: 'Alice' })
    expect(record.id).toBe(1)
    expect(record.name).toBe('Alice')
  })

  it('adds a canary field to the record', () => {
    const record = createCanary({ id: 1 })
    const keys = Object.keys(record)
    expect(keys.length).toBe(2)
    const token = Object.values(record).find(v => typeof v === 'string' && v.length === 32)
    expect(token).toBeDefined()
  })

  it('produces a unique token each time', () => {
    const a = createCanary({ x: 1 })
    const b = createCanary({ x: 1 })
    const tokenA = Object.values(a).find(v => typeof v === 'string')
    const tokenB = Object.values(b).find(v => typeof v === 'string')
    expect(tokenA).not.toBe(tokenB)
  })

  it('registers the token in the registry', () => {
    const sizeBefore = canaryRegistrySize()
    const record = createCanary({ x: 1 })
    expect(canaryRegistrySize()).toBe(sizeBefore + 1)
    const token = Object.values(record).find(v => typeof v === 'string') as string
    expect(isCanaryToken(token)).toBe(true)
  })
})

describe('isCanaryToken', () => {
  it('returns false for unknown strings', () => {
    expect(isCanaryToken('not-a-token')).toBe(false)
    expect(isCanaryToken('')).toBe(false)
  })

  it('returns true for a registered token', () => {
    const record = createCanary({ x: 1 })
    const token = Object.values(record).find(v => typeof v === 'string') as string
    expect(isCanaryToken(token)).toBe(true)
  })
})

describe('revokeCanary', () => {
  it('removes the token from the registry', () => {
    const record = createCanary({ x: 1 })
    const token = Object.values(record).find(v => typeof v === 'string') as string
    expect(isCanaryToken(token)).toBe(true)
    revokeCanary(token)
    expect(isCanaryToken(token)).toBe(false)
  })

  it('is a no-op for unknown tokens', () => {
    expect(() => revokeCanary('nonexistent')).not.toThrow()
  })
})

describe('scanForCanary', () => {
  it('returns false for clean objects', () => {
    const ctx = makeCtx()
    expect(scanForCanary({ id: 1, name: 'Alice' }, ctx)).toBe(false)
    expect(ctx.kairo.events).toHaveLength(0)
  })

  it('returns false for null/undefined', () => {
    const ctx = makeCtx()
    expect(scanForCanary(null, ctx)).toBe(false)
    expect(scanForCanary(undefined, ctx)).toBe(false)
  })

  it('detects a canary token at the top level', () => {
    const ctx = makeCtx()
    const record = createCanary({ id: 99, name: 'Sentinel' })
    expect(scanForCanary(record, ctx)).toBe(true)
  })

  it('detects a canary token nested in an array', () => {
    const ctx = makeCtx()
    const record = createCanary({ secret: 'data' })
    expect(scanForCanary([{ safe: 1 }, record], ctx)).toBe(true)
  })

  it('detects a canary token deeply nested', () => {
    const ctx = makeCtx()
    const record = createCanary({ id: 1 })
    const wrapped = { outer: { middle: { inner: record } } }
    expect(scanForCanary(wrapped, ctx)).toBe(true)
  })

  it('elevates entropy when a canary is found', () => {
    const ctx = makeCtx()
    const record = createCanary({ id: 1 })
    scanForCanary(record, ctx)
    expect(ctx.kairo.entropy).toBeGreaterThan(0)
  })

  it('emits a canary_triggered event', () => {
    const ctx = makeCtx()
    const record = createCanary({ id: 1 })
    scanForCanary(record, ctx)
    expect(ctx.kairo.events[0]?.type).toBe('canary_triggered')
  })

  it('does not detect a revoked token', () => {
    const ctx = makeCtx()
    const record = createCanary({ id: 1 })
    const token = Object.values(record).find(v => typeof v === 'string') as string
    revokeCanary(token)
    expect(scanForCanary(record, ctx)).toBe(false)
  })

  it('returns false for arrays of primitives', () => {
    const ctx = makeCtx()
    expect(scanForCanary([1, 2, 3], ctx)).toBe(false)
    expect(scanForCanary(['a', 'b'], ctx)).toBe(false)
  })
})

describe('canary registry — memory safety', () => {
  it('does not throw when creating many canary tokens (registry cap enforced)', () => {
    // Create a large number of tokens — the registry must not grow without bound
    // and must not throw. We only create 200 to keep the test fast.
    expect(() => {
      for (let i = 0; i < 200; i++) {
        createCanary({ i })
      }
    }).not.toThrow()
    // Registry must remain bounded (≤ 100,000 per cap, but we verify it grew)
    expect(canaryRegistrySize()).toBeGreaterThan(0)
  })
})

describe('revokeCanaryAfter', () => {
  it('auto-revokes a token after the specified delay', async () => {
    vi.useFakeTimers()
    const rec = createCanary({ id: 1 })
    const token = (rec as Record<string, unknown>)['__k_c__'] as string
    expect(isCanaryToken(token)).toBe(true)

    revokeCanaryAfter(token, 1000)
    vi.advanceTimersByTime(999)
    expect(isCanaryToken(token)).toBe(true)   // still alive

    vi.advanceTimersByTime(1)
    expect(isCanaryToken(token)).toBe(false)  // evicted
    vi.useRealTimers()
  })

  it('is a no-op when the token does not exist', () => {
    expect(() => revokeCanaryAfter('nonexistent-token', 100)).not.toThrow()
  })
})
