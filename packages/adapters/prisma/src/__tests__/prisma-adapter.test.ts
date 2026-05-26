import { describe, it, expect, vi } from 'vitest'
import { createPrismaAdapter, KairoEntropyError } from '../prisma-adapter.js'
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

function makeMockPrisma(findResult: unknown = { id: 1, name: 'Alice' }) {
  const findUnique = vi.fn().mockResolvedValue(findResult)
  const create     = vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => args.data)
  return {
    user: { findUnique, create },
    _mocks: { findUnique, create },
  }
}

// ─── Entropy gate ─────────────────────────────────────────────────────────────

describe('createPrismaAdapter — entropy gate', () => {
  it('passes through when entropy is below gate', async () => {
    const prisma = makeMockPrisma()
    const kp = createPrismaAdapter(prisma, { entropyGate: 0.8 })
    const db = kp.withContext(makeCtx(0.5))
    await expect(db.user.findUnique({ where: { id: 1 } })).resolves.toBeDefined()
  })

  it('throws KairoEntropyError when entropy meets gate', async () => {
    const prisma = makeMockPrisma()
    const kp = createPrismaAdapter(prisma, { entropyGate: 0.8 })
    const db = kp.withContext(makeCtx(0.8))
    await expect(db.user.findUnique({ where: { id: 1 } })).rejects.toBeInstanceOf(KairoEntropyError)
  })

  it('throws KairoEntropyError when entropy exceeds gate', async () => {
    const prisma = makeMockPrisma()
    const kp = createPrismaAdapter(prisma, { entropyGate: 0.5 })
    const db = kp.withContext(makeCtx(0.9))
    await expect(db.user.findUnique({ where: { id: 1 } })).rejects.toThrow('Query blocked')
  })

  it('emits entropy_spike event on gate trigger', async () => {
    const prisma = makeMockPrisma()
    const kp = createPrismaAdapter(prisma, { entropyGate: 0.5 })
    const ctx = makeCtx(0.9)
    const db = kp.withContext(ctx)
    try { await db.user.findUnique({ where: { id: 1 } }) } catch { /* expected */ }
    expect(ctx.kairo.events.some(e => e.type === 'entropy_spike')).toBe(true)
  })

  it('does not gate when no entropyGate is configured', async () => {
    const prisma = makeMockPrisma()
    const kp = createPrismaAdapter(prisma)
    const db = kp.withContext(makeCtx(1.0))
    await expect(db.user.findUnique({ where: { id: 1 } })).resolves.toBeDefined()
  })
})

// ─── Canary injection ─────────────────────────────────────────────────────────

describe('createPrismaAdapter — canary injection', () => {
  it('injects __k_c__ on create for listed models', async () => {
    const prisma = makeMockPrisma()
    const kp = createPrismaAdapter(prisma, { canaryModels: ['user'] })
    const db = kp.withContext(makeCtx())
    await db.user.create({ data: { name: 'Alice' } })

    const calledWith = prisma._mocks.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }
    expect(calledWith.data['__k_c__']).toBeDefined()
    expect(typeof calledWith.data['__k_c__']).toBe('string')
  })

  it('does not inject canary for unlisted models', async () => {
    const prisma = makeMockPrisma()
    const kp = createPrismaAdapter(prisma, { canaryModels: ['order'] })
    const db = kp.withContext(makeCtx())
    await db.user.create({ data: { name: 'Alice' } })

    const calledWith = prisma._mocks.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }
    expect(calledWith.data['__k_c__']).toBeUndefined()
  })

  it('does not overwrite existing __k_c__', async () => {
    const prisma = makeMockPrisma()
    const kp = createPrismaAdapter(prisma, { canaryModels: ['user'] })
    const db = kp.withContext(makeCtx())
    await db.user.create({ data: { name: 'Alice', __k_c__: 'existing-token' } })

    const calledWith = prisma._mocks.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }
    expect(calledWith.data['__k_c__']).toBe('existing-token')
  })
})

// ─── Canary result scan ───────────────────────────────────────────────────────

describe('createPrismaAdapter — canary result scan', () => {
  it('emits canary_triggered when result contains a registered canary', async () => {
    const { createCanary } = await import('@thekairojs/kairo-sentinel')
    const ctx = makeCtx()
    const withCanary = createCanary({ id: 1 }, ctx)

    const prisma = makeMockPrisma(withCanary)
    const kp = createPrismaAdapter(prisma, { canaryModels: ['user'], scanResults: true })
    const db = kp.withContext(ctx)
    await db.user.findUnique({ where: { id: 1 } })

    expect(ctx.kairo.events.some(e => e.type === 'canary_triggered')).toBe(true)
  })

  it('does not emit canary_triggered for clean results', async () => {
    const prisma = makeMockPrisma({ id: 1, name: 'Alice' })
    const kp = createPrismaAdapter(prisma, { scanResults: true })
    const ctx = makeCtx()
    const db = kp.withContext(ctx)
    await db.user.findUnique({ where: { id: 1 } })

    expect(ctx.kairo.events.some(e => e.type === 'canary_triggered')).toBe(false)
  })
})
