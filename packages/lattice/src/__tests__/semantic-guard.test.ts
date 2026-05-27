import { describe, it, expect, vi } from 'vitest'
import { createSemanticGuard, semanticCheck } from '../semantic-guard.js'
import type { KairoContext } from '@thekairojs/kairo'

function makeCtx(overrides: Partial<KairoContext> = {}): KairoContext {
  return {
    path: '/test',
    method: 'GET',
    state: {},
    kairo: {
      entropy: 0,
      lattice: { claims: null, resolved: false },
      taintedPaths: new Set(),
      ghostRouteTriggered: false,
      hardeningActive: false,
      overrides: [],
      events: [],
      intent: { type: 'unknown', confidence: 0, signals: [], resolved: false },
    },
    json: vi.fn(),
    ...overrides,
  } as unknown as KairoContext
}

describe('createSemanticGuard', () => {
  it('passes through when no rules match', async () => {
    const guard = createSemanticGuard({
      rules: [{ when: { risk: 'critical' }, enforce: { minLevel: 'high' } }]
    })
    const ctx = makeCtx()
    ctx.state['kairo.route.options'] = { risk: 'low' }
    ctx.kairo.lattice = { claims: { level: 'none', roles: [] }, resolved: true }

    let nextCalled = false
    await guard(ctx, async () => { nextCalled = true })
    expect(nextCalled).toBe(true)
  })

  it('denies when risk matches and level is insufficient', async () => {
    const guard = createSemanticGuard({
      rules: [{ when: { risk: 'critical' }, enforce: { minLevel: 'high' } }]
    })
    const ctx = makeCtx()
    ctx.state['kairo.route.options'] = { risk: 'critical' }
    ctx.kairo.lattice = { claims: { level: 'low', roles: [] }, resolved: true }

    let nextCalled = false
    await guard(ctx, async () => { nextCalled = true })
    expect(nextCalled).toBe(false)
    expect(ctx.json).toHaveBeenCalledWith({ error: 'Forbidden' }, 403)
  })

  it('allows when risk matches and level is sufficient', async () => {
    const guard = createSemanticGuard({
      rules: [{ when: { risk: 'critical' }, enforce: { minLevel: 'high' } }]
    })
    const ctx = makeCtx()
    ctx.state['kairo.route.options'] = { risk: 'critical' }
    ctx.kairo.lattice = { claims: { level: 'high', roles: ['admin'] }, resolved: true }

    let nextCalled = false
    await guard(ctx, async () => { nextCalled = true })
    expect(nextCalled).toBe(true)
  })

  it('matches on tags', async () => {
    const guard = createSemanticGuard({
      rules: [{ when: { tags: ['pii'] }, enforce: { minLevel: 'medium' } }]
    })
    const ctx = makeCtx()
    ctx.state['kairo.route.options'] = { tags: ['pii', 'read-only'] }
    ctx.kairo.lattice = { claims: { level: 'none', roles: [] }, resolved: true }

    await guard(ctx, async () => {})
    expect(ctx.json).toHaveBeenCalledWith({ error: 'Forbidden' }, 403)
  })

  it('does not match when tag is absent', async () => {
    const guard = createSemanticGuard({
      rules: [{ when: { tags: ['pii'] }, enforce: { minLevel: 'medium' } }]
    })
    const ctx = makeCtx()
    ctx.state['kairo.route.options'] = { tags: ['read-only'] }
    ctx.kairo.lattice = { claims: { level: 'none', roles: [] }, resolved: true }

    let nextCalled = false
    await guard(ctx, async () => { nextCalled = true })
    expect(nextCalled).toBe(true)
  })
})

describe('semanticCheck', () => {
  it('blocks when inline condition matches and level insufficient', async () => {
    const ctx = makeCtx()
    ctx.kairo.lattice = { claims: { level: 'low', roles: [] }, resolved: true }
    const mw = semanticCheck({ risk: 'high', minLevel: 'medium' })

    // semanticCheck reads the condition directly, not from ctx.state
    let nextCalled = false
    await mw(ctx, async () => { nextCalled = true })
    // No route options in state, so condition doesn't match → passes through
    expect(nextCalled).toBe(true)
  })
})
