import { describe, it, expect, vi } from 'vitest'
import { createLattice, meetsLevel, parseTrustLevel } from '../index.js'
import { createContext, createRequest, createResponse } from '@thekairojs/kairo'
import type { KairoContext, TrustClaims } from '@thekairojs/kairo'
import type { IncomingMessage, ServerResponse } from 'node:http'

function makeCtx(url = '/'): KairoContext {
  const raw = Object.assign(Object.create(null), {
    method: 'GET', url,
    headers: {}, socket: { remoteAddress: '127.0.0.1' },
  }) as unknown as IncomingMessage
  const rawRes = Object.assign(Object.create(null), {
    headersSent: false, setHeader() {}, writeHead() {}, end() {},
  }) as unknown as ServerResponse
  return createContext(createRequest(raw), createResponse(rawRes), {})
}

function noop(): Promise<void> { return Promise.resolve() }

// ─── meetsLevel ──────────────────────────────────────────────────────────────

describe('meetsLevel', () => {
  it('none satisfies none', () => expect(meetsLevel('none', 'none')).toBe(true))
  it('none does not satisfy low', () => expect(meetsLevel('none', 'low')).toBe(false))
  it('none does not satisfy medium', () => expect(meetsLevel('none', 'medium')).toBe(false))
  it('none does not satisfy high', () => expect(meetsLevel('none', 'high')).toBe(false))

  it('low satisfies none', () => expect(meetsLevel('low', 'none')).toBe(true))
  it('low satisfies low', () => expect(meetsLevel('low', 'low')).toBe(true))
  it('low does not satisfy medium', () => expect(meetsLevel('low', 'medium')).toBe(false))
  it('low does not satisfy high', () => expect(meetsLevel('low', 'high')).toBe(false))

  it('medium satisfies none', () => expect(meetsLevel('medium', 'none')).toBe(true))
  it('medium satisfies low', () => expect(meetsLevel('medium', 'low')).toBe(true))
  it('medium satisfies medium', () => expect(meetsLevel('medium', 'medium')).toBe(true))
  it('medium does not satisfy high', () => expect(meetsLevel('medium', 'high')).toBe(false))

  it('high satisfies all levels', () => {
    expect(meetsLevel('high', 'none')).toBe(true)
    expect(meetsLevel('high', 'low')).toBe(true)
    expect(meetsLevel('high', 'medium')).toBe(true)
    expect(meetsLevel('high', 'high')).toBe(true)
  })
})

// ─── parseTrustLevel ─────────────────────────────────────────────────────────

describe('parseTrustLevel', () => {
  it('parses all valid levels', () => {
    expect(parseTrustLevel('none')).toBe('none')
    expect(parseTrustLevel('low')).toBe('low')
    expect(parseTrustLevel('medium')).toBe('medium')
    expect(parseTrustLevel('high')).toBe('high')
  })

  it('returns null for unknown strings', () => {
    expect(parseTrustLevel('admin')).toBeNull()
    expect(parseTrustLevel('')).toBeNull()
    expect(parseTrustLevel('HIGH')).toBeNull()
  })
})

// ─── createLattice — resolve middleware ──────────────────────────────────────

describe('createLattice — resolve middleware', () => {
  it('populates ctx.kairo.lattice.claims after next() is reached', async () => {
    const ctx = makeCtx()
    const claims: TrustClaims = { level: 'high', roles: ['admin'], subject: 'u1' }
    const lattice = createLattice({ resolve: () => claims })

    await lattice.onRequest!(ctx, noop)

    expect(ctx.kairo.lattice.resolved).toBe(true)
    expect(ctx.kairo.lattice.claims).toEqual(claims)
  })

  it('treats a throwing resolver as anonymous (none)', async () => {
    const ctx = makeCtx()
    const lattice = createLattice({ resolve: () => { throw new Error('db down') } })

    await lattice.onRequest!(ctx, noop)

    expect(ctx.kairo.lattice.resolved).toBe(true)
    expect(ctx.kairo.lattice.claims?.level).toBe('none')
    expect(ctx.kairo.lattice.claims?.roles).toEqual([])
  })

  it('does not call resolve again if claims are already present', async () => {
    const ctx = makeCtx()
    ctx.kairo.lattice = { claims: { level: 'medium', roles: [] }, resolved: true }

    const resolver = vi.fn().mockResolvedValue({ level: 'high', roles: [] })
    const lattice = createLattice({ resolve: resolver })

    await lattice.onRequest!(ctx, noop)

    expect(resolver).not.toHaveBeenCalled()
    expect(ctx.kairo.lattice.claims?.level).toBe('medium')
  })

  it('awaits async resolvers', async () => {
    const ctx = makeCtx()
    const lattice = createLattice({
      resolve: async () => {
        await new Promise(r => setTimeout(r, 1))
        return { level: 'low', roles: ['user'] }
      },
    })

    await lattice.onRequest!(ctx, noop)

    expect(ctx.kairo.lattice.claims?.level).toBe('low')
  })
})

// ─── createLattice — require() middleware ─────────────────────────────────────

describe('createLattice — require() level checks', () => {
  function makeResolved(level: TrustClaims['level'], roles: string[] = []): KairoContext {
    const ctx = makeCtx()
    ctx.kairo.lattice = { claims: { level, roles }, resolved: true }
    return ctx
  }

  it('allows request when level is met', async () => {
    const lattice = createLattice({ resolve: () => ({ level: 'high', roles: [] }) })
    const ctx = makeResolved('high')
    const next = vi.fn().mockResolvedValue(undefined)

    await lattice.require({ level: 'medium' })(ctx, next)

    expect(next).toHaveBeenCalled()
    expect(ctx.kairo.lattice.claims?.level).toBe('high')
  })

  it('blocks request when level is insufficient', async () => {
    const lattice = createLattice({ resolve: () => ({ level: 'low', roles: [] }) })
    const ctx = makeResolved('low')
    const next = vi.fn()

    await lattice.require({ level: 'high' })(ctx, next)

    expect(next).not.toHaveBeenCalled()
  })

  it('blocks anonymous (none) when no options given (default: low)', async () => {
    const lattice = createLattice({ resolve: () => ({ level: 'none', roles: [] }) })
    const ctx = makeResolved('none')
    const next = vi.fn()

    await lattice.require()(ctx, next)

    expect(next).not.toHaveBeenCalled()
  })

  it('allows low-trust when no options given (default: low)', async () => {
    const lattice = createLattice({ resolve: () => ({ level: 'low', roles: [] }) })
    const ctx = makeResolved('low')
    const next = vi.fn().mockResolvedValue(undefined)

    await lattice.require()(ctx, next)

    expect(next).toHaveBeenCalled()
  })

  it('blocks when claims are not resolved', async () => {
    const lattice = createLattice({ resolve: () => ({ level: 'high', roles: [] }) })
    const ctx = makeCtx() // lattice unresolved
    const next = vi.fn()

    await lattice.require({ level: 'low' })(ctx, next)

    expect(next).not.toHaveBeenCalled()
  })
})

describe('createLattice — require() role checks', () => {
  function makeResolved(level: TrustClaims['level'], roles: string[]): KairoContext {
    const ctx = makeCtx()
    ctx.kairo.lattice = { claims: { level, roles }, resolved: true }
    return ctx
  }

  it('allows when caller has one of the required roles', async () => {
    const lattice = createLattice({ resolve: () => ({ level: 'high', roles: [] }) })
    const ctx = makeResolved('high', ['admin', 'editor'])
    const next = vi.fn().mockResolvedValue(undefined)

    await lattice.require({ level: 'high', roles: ['admin'] })(ctx, next)

    expect(next).toHaveBeenCalled()
  })

  it('blocks when caller has none of the required roles', async () => {
    const lattice = createLattice({ resolve: () => ({ level: 'high', roles: [] }) })
    const ctx = makeResolved('high', ['editor'])
    const next = vi.fn()

    await lattice.require({ level: 'high', roles: ['admin'] })(ctx, next)

    expect(next).not.toHaveBeenCalled()
  })

  it('requires ALL roles when all: true', async () => {
    const lattice = createLattice({ resolve: () => ({ level: 'high', roles: [] }) })
    const ctxOk = makeResolved('high', ['admin', 'billing'])
    const ctxBad = makeResolved('high', ['admin'])
    const nextOk = vi.fn().mockResolvedValue(undefined)
    const nextBad = vi.fn()

    await lattice.require({ level: 'high', roles: ['admin', 'billing'], all: true })(ctxOk, nextOk)
    await lattice.require({ level: 'high', roles: ['admin', 'billing'], all: true })(ctxBad, nextBad)

    expect(nextOk).toHaveBeenCalled()
    expect(nextBad).not.toHaveBeenCalled()
  })

  it('passes with no roles required when roles is empty', async () => {
    const lattice = createLattice({ resolve: () => ({ level: 'high', roles: [] }) })
    const ctx = makeResolved('high', [])
    const next = vi.fn().mockResolvedValue(undefined)

    await lattice.require({ level: 'high', roles: [] })(ctx, next)

    expect(next).toHaveBeenCalled()
  })
})

describe('createLattice — denial side-effects', () => {
  function makeResolved(level: TrustClaims['level']): KairoContext {
    const ctx = makeCtx()
    ctx.kairo.lattice = { claims: { level, roles: [] }, resolved: true }
    return ctx
  }

  it('elevates entropy on denial', async () => {
    const lattice = createLattice({ resolve: () => ({ level: 'none', roles: [] }) })
    const ctx = makeResolved('none')

    await lattice.require({ level: 'high' })(ctx, noop)

    expect(ctx.kairo.entropy).toBeGreaterThan(0)
  })

  it('emits a lattice_denied security event', async () => {
    const lattice = createLattice({ resolve: () => ({ level: 'none', roles: [] }) })
    const ctx = makeResolved('none')

    await lattice.require({ level: 'high' })(ctx, noop)

    const event = ctx.kairo.events[0]
    expect(event?.type).toBe('lattice_denied')
    expect(event?.route).toBe('/')
  })

  it('calls custom onDeny instead of default 403', async () => {
    const onDeny = vi.fn()
    const lattice = createLattice({
      resolve: () => ({ level: 'none', roles: [] }),
      onDeny,
    })
    const ctx = makeResolved('none')

    await lattice.require({ level: 'high' })(ctx, noop)

    expect(onDeny).toHaveBeenCalledWith(ctx, expect.stringContaining('high'))
  })

  it('sends default 403 JSON when no onDeny provided', async () => {
    const lattice = createLattice({ resolve: () => ({ level: 'none', roles: [] }) })
    const ctx = makeResolved('none')
    const jsonSpy = vi.spyOn(ctx, 'json')

    await lattice.require({ level: 'high' })(ctx, noop)

    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Forbidden' }),
      403,
    )
  })

  it('caps entropy at 1.0 even when already elevated', async () => {
    const lattice = createLattice({ resolve: () => ({ level: 'none', roles: [] }) })
    const ctx = makeResolved('none')
    ctx.kairo.entropy = 0.9

    await lattice.require({ level: 'high' })(ctx, noop)

    expect(ctx.kairo.entropy).toBe(1.0)
  })
})
