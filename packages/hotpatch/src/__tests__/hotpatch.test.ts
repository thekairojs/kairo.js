import { describe, it, expect, vi } from 'vitest'
import { createHotpatchBus } from '../hotpatch.js'
import type { KairoContext, Middleware } from '@thekairojs/kairo'

function makeCtx(): KairoContext {
  return { state: {} } as unknown as KairoContext
}

async function runChain(middleware: Middleware, ctx: KairoContext): Promise<string[]> {
  const log: string[] = []
  await middleware(ctx, async () => { log.push('next') })
  return log
}

describe('createHotpatchBus', () => {
  it('calls next when no patches are registered', async () => {
    const bus = createHotpatchBus()
    const ctx = makeCtx()
    const log = await runChain(bus.onRequest!, ctx)
    expect(log).toEqual(['next'])
  })

  it('runs a single patch then next', async () => {
    const bus = createHotpatchBus()
    const log: string[] = []
    bus.patch('a', async (_ctx, next) => { log.push('a'); await next() })
    const ctx = makeCtx()
    await runChain(bus.onRequest!, ctx)
    expect(log).toEqual(['a'])
  })

  it('runs patches in registration order', async () => {
    const bus = createHotpatchBus()
    const log: string[] = []
    bus.patch('a', async (_ctx, next) => { log.push('a'); await next() })
    bus.patch('b', async (_ctx, next) => { log.push('b'); await next() })
    bus.patch('c', async (_ctx, next) => { log.push('c'); await next() })
    await bus.onRequest!(makeCtx(), async () => { log.push('next') })
    expect(log).toEqual(['a', 'b', 'c', 'next'])
  })

  it('replaces an existing patch in-place without changing order', async () => {
    const bus = createHotpatchBus()
    const log: string[] = []
    bus.patch('a', async (_ctx, next) => { log.push('a-v1'); await next() })
    bus.patch('b', async (_ctx, next) => { log.push('b'); await next() })
    bus.patch('a', async (_ctx, next) => { log.push('a-v2'); await next() })
    await bus.onRequest!(makeCtx(), async () => { log.push('next') })
    expect(log).toEqual(['a-v2', 'b', 'next'])
    expect(bus.list()).toEqual(['a', 'b'])
  })

  it('unpatches by id', async () => {
    const bus = createHotpatchBus()
    const log: string[] = []
    bus.patch('a', async (_ctx, next) => { log.push('a'); await next() })
    bus.patch('b', async (_ctx, next) => { log.push('b'); await next() })
    bus.unpatch('a')
    await bus.onRequest!(makeCtx(), async () => { log.push('next') })
    expect(log).toEqual(['b', 'next'])
    expect(bus.list()).toEqual(['b'])
  })

  it('no-ops unpatch on unknown id', () => {
    const bus = createHotpatchBus()
    expect(() => bus.unpatch('unknown')).not.toThrow()
  })

  it('fires onPatch and onUnpatch callbacks', () => {
    const onPatch = vi.fn()
    const onUnpatch = vi.fn()
    const bus = createHotpatchBus({ onPatch, onUnpatch })
    const mw: Middleware = async (_ctx, next) => next()
    bus.patch('x', mw)
    expect(onPatch).toHaveBeenCalledWith('x', mw)
    bus.unpatch('x')
    expect(onUnpatch).toHaveBeenCalledWith('x')
  })

  it('a patch that does not call next short-circuits the chain', async () => {
    const bus = createHotpatchBus()
    const log: string[] = []
    bus.patch('blocker', async () => { log.push('blocked') })
    bus.patch('after', async (_ctx, next) => { log.push('after'); await next() })
    await bus.onRequest!(makeCtx(), async () => { log.push('next') })
    expect(log).toEqual(['blocked'])
  })
})
