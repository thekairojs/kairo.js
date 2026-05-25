import { describe, it, expect, vi } from 'vitest'
import { compose } from '../middleware.js'
import type { KairoContext, Middleware } from '../types.js'

const fakeCtx = {} as KairoContext

describe('compose', () => {
  it('runs a single middleware', async () => {
    const log: string[] = []
    const mw: Middleware = async (_ctx, next) => {
      log.push('before')
      await next()
      log.push('after')
    }
    const fn = compose([mw])
    await fn(fakeCtx)
    expect(log).toEqual(['before', 'after'])
  })

  it('runs multiple middlewares in order', async () => {
    const log: string[] = []
    const mw1: Middleware = async (_ctx, next) => { log.push('1-before'); await next(); log.push('1-after') }
    const mw2: Middleware = async (_ctx, next) => { log.push('2-before'); await next(); log.push('2-after') }
    const mw3: Middleware = async (_ctx, next) => { log.push('3-before'); await next(); log.push('3-after') }

    const fn = compose([mw1, mw2, mw3])
    await fn(fakeCtx)
    expect(log).toEqual(['1-before', '2-before', '3-before', '3-after', '2-after', '1-after'])
  })

  it('calls finalNext when provided', async () => {
    const finalNext = vi.fn().mockResolvedValue(undefined)
    const fn = compose([])
    await fn(fakeCtx, finalNext)
    expect(finalNext).toHaveBeenCalledOnce()
  })

  it('does not call finalNext when middleware short-circuits', async () => {
    const finalNext = vi.fn()
    const mw: Middleware = async () => { /* intentionally no next() */ }
    const fn = compose([mw])
    await fn(fakeCtx, finalNext)
    expect(finalNext).not.toHaveBeenCalled()
  })

  it('propagates errors from middleware', async () => {
    const mw: Middleware = async () => { throw new Error('boom') }
    const fn = compose([mw])
    await expect(fn(fakeCtx)).rejects.toThrow('boom')
  })

  it('rejects if next() is called multiple times', async () => {
    const mw: Middleware = async (_ctx, next) => {
      await next()
      await next()
    }
    const fn = compose([mw])
    await expect(fn(fakeCtx)).rejects.toThrow('next() called multiple times')
  })

  it('throws if a middleware is not a function', () => {
    expect(() => compose(['not a function' as unknown as Middleware])).toThrow(TypeError)
  })

  it('resolves immediately with an empty array', async () => {
    const fn = compose([])
    await expect(fn(fakeCtx)).resolves.toBeUndefined()
  })
})
