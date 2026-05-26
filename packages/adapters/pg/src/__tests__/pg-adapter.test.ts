import { describe, it, expect, vi } from 'vitest'
import { createPgAdapter, KairoEntropyError } from '../pg-adapter.js'
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

function makeMockPool(rows: Record<string, unknown>[] = [{ id: 1 }]) {
  return {
    query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }),
  }
}

// ─── Entropy gate ─────────────────────────────────────────────────────────────

describe('createPgAdapter — query entropy gate', () => {
  it('executes the query when entropy is below gate', async () => {
    const pool = makeMockPool()
    const kpg = createPgAdapter(pool, { entropyGate: 0.8 })
    const result = await kpg.query(makeCtx(0.3), 'SELECT 1')
    expect(result.rows).toHaveLength(1)
    expect(pool.query).toHaveBeenCalledOnce()
  })

  it('throws KairoEntropyError when entropy meets gate', async () => {
    const pool = makeMockPool()
    const kpg = createPgAdapter(pool, { entropyGate: 0.8 })
    await expect(kpg.query(makeCtx(0.8), 'SELECT 1')).rejects.toBeInstanceOf(KairoEntropyError)
    expect(pool.query).not.toHaveBeenCalled()
  })

  it('never calls pool.query when blocked', async () => {
    const pool = makeMockPool()
    const kpg = createPgAdapter(pool, { entropyGate: 0.5 })
    try { await kpg.query(makeCtx(0.9), 'SELECT 1') } catch { /* expected */ }
    expect(pool.query).not.toHaveBeenCalled()
  })

  it('emits entropy_spike on gate trigger', async () => {
    const pool = makeMockPool()
    const kpg = createPgAdapter(pool, { entropyGate: 0.5 })
    const ctx = makeCtx(0.9)
    try { await kpg.query(ctx, 'SELECT 1') } catch { /* expected */ }
    expect(ctx.kairo.events.some(e => e.type === 'entropy_spike')).toBe(true)
  })

  it('allows query with no gate configured even at entropy 1.0', async () => {
    const pool = makeMockPool()
    const kpg = createPgAdapter(pool)
    const result = await kpg.query(makeCtx(1.0), 'SELECT 1')
    expect(result.rows).toHaveLength(1)
  })

  it('forwards values array to pool.query', async () => {
    const pool = makeMockPool()
    const kpg = createPgAdapter(pool)
    await kpg.query(makeCtx(), 'SELECT * FROM users WHERE id = $1', [42])
    expect(pool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [42])
  })
})

// ─── Result scanning ──────────────────────────────────────────────────────────

describe('createPgAdapter — result scanning', () => {
  it('emits canary_triggered when rows contain a registered canary', async () => {
    const { createCanary } = await import('@thekairojs/kairo-sentinel')
    const ctx = makeCtx()
    const row = createCanary({ id: 1 }, ctx)
    const pool = makeMockPool([row])
    const kpg = createPgAdapter(pool, { scanResults: true })
    await kpg.query(ctx, 'SELECT * FROM users')
    expect(ctx.kairo.events.some(e => e.type === 'canary_triggered')).toBe(true)
  })

  it('does not emit for clean rows', async () => {
    const pool = makeMockPool([{ id: 1, name: 'Alice' }])
    const kpg = createPgAdapter(pool, { scanResults: true })
    const ctx = makeCtx()
    await kpg.query(ctx, 'SELECT * FROM users')
    expect(ctx.kairo.events.some(e => e.type === 'canary_triggered')).toBe(false)
  })

  it('does not scan when scanResults is false (default)', async () => {
    const { createCanary } = await import('@thekairojs/kairo-sentinel')
    const ctx = makeCtx()
    const row = createCanary({ id: 1 }, ctx)
    const pool = makeMockPool([row])
    const kpg = createPgAdapter(pool)
    await kpg.query(ctx, 'SELECT * FROM orders')
    expect(ctx.kairo.events.some(e => e.type === 'canary_triggered')).toBe(false)
  })
})

// ─── withCanary() ─────────────────────────────────────────────────────────────

describe('createPgAdapter — withCanary()', () => {
  it('adds __k_c__ field to the record', () => {
    const kpg = createPgAdapter(makeMockPool())
    const row = kpg.withCanary({ name: 'Alice' })
    expect(row.__k_c__).toBeDefined()
    expect(typeof row.__k_c__).toBe('string')
    expect(row.name).toBe('Alice')
  })

  it('generates a unique token each call', () => {
    const kpg = createPgAdapter(makeMockPool())
    expect(kpg.withCanary({ x: 1 }).__k_c__).not.toBe(kpg.withCanary({ x: 1 }).__k_c__)
  })
})
