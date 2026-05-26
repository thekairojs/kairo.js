import { describe, it, expect } from 'vitest'
import { createDrizzleAdapter, KairoEntropyError } from '../index.js'
import { createContext, createRequest, createResponse } from '@thekairojs/kairo'
import type { KairoContext } from '@thekairojs/kairo'
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

const mockDb = {}

// ─── exec() ───────────────────────────────────────────────────────────────────

describe('createDrizzleAdapter — exec()', () => {
  it('resolves the query when entropy is below gate', async () => {
    const kd = createDrizzleAdapter(mockDb, { entropyGate: 0.8 })
    const result = await kd.exec(makeCtx(0.3), Promise.resolve([{ id: 1 }]))
    expect(result).toEqual([{ id: 1 }])
  })

  it('throws KairoEntropyError when entropy meets gate', async () => {
    const kd = createDrizzleAdapter(mockDb, { entropyGate: 0.8 })
    await expect(kd.exec(makeCtx(0.8), Promise.resolve([]))).rejects.toBeInstanceOf(KairoEntropyError)
  })

  it('throws KairoEntropyError when entropy exceeds gate', async () => {
    const kd = createDrizzleAdapter(mockDb, { entropyGate: 0.5 })
    await expect(kd.exec(makeCtx(0.9), Promise.resolve([]))).rejects.toThrow('Query blocked')
  })

  it('emits entropy_spike event on gate trigger', async () => {
    const kd = createDrizzleAdapter(mockDb, { entropyGate: 0.5 })
    const ctx = makeCtx(0.9)
    try { await kd.exec(ctx, Promise.resolve([])) } catch { /* expected */ }
    expect(ctx.kairo.events.some(e => e.type === 'entropy_spike')).toBe(true)
  })

  it('allows query when no entropyGate is set', async () => {
    const kd = createDrizzleAdapter(mockDb)
    const result = await kd.exec(makeCtx(1.0), Promise.resolve('ok'))
    expect(result).toBe('ok')
  })
})

// ─── insert() ─────────────────────────────────────────────────────────────────

describe('createDrizzleAdapter — insert()', () => {
  it('resolves normally when entropy is low', async () => {
    const kd = createDrizzleAdapter(mockDb, { entropyGate: 0.9 })
    const result = await kd.insert(makeCtx(0.1), Promise.resolve({ insertId: 42 }))
    expect(result).toEqual({ insertId: 42 })
  })

  it('throws KairoEntropyError when entropy is high', async () => {
    const kd = createDrizzleAdapter(mockDb, { entropyGate: 0.5 })
    await expect(kd.insert(makeCtx(0.8), Promise.resolve({}))).rejects.toBeInstanceOf(KairoEntropyError)
  })
})

// ─── withCanary() ─────────────────────────────────────────────────────────────

describe('createDrizzleAdapter — withCanary()', () => {
  it('adds __k_c__ field to the record', () => {
    const kd = createDrizzleAdapter(mockDb)
    const result = kd.withCanary({ name: 'Alice' })
    expect(result.__k_c__).toBeDefined()
    expect(typeof result.__k_c__).toBe('string')
    expect(result.name).toBe('Alice')
  })

  it('generates a unique token each call', () => {
    const kd = createDrizzleAdapter(mockDb)
    expect(kd.withCanary({ x: 1 }).__k_c__).not.toBe(kd.withCanary({ x: 1 }).__k_c__)
  })
})

// ─── result scanning ──────────────────────────────────────────────────────────

describe('createDrizzleAdapter — result scanning', () => {
  it('emits canary_triggered when result contains a registered canary', async () => {
    const { createCanary } = await import('@thekairojs/kairo-sentinel')
    const ctx = makeCtx()
    const row = createCanary({ id: 1 }, ctx)

    const kd = createDrizzleAdapter(mockDb, { scanResults: true })
    await kd.exec(ctx, Promise.resolve([row]))
    expect(ctx.kairo.events.some(e => e.type === 'canary_triggered')).toBe(true)
  })

  it('does not emit for clean results', async () => {
    const kd = createDrizzleAdapter(mockDb, { scanResults: true })
    const ctx = makeCtx()
    await kd.exec(ctx, Promise.resolve([{ id: 1, name: 'Alice' }]))
    expect(ctx.kairo.events.some(e => e.type === 'canary_triggered')).toBe(false)
  })
})
