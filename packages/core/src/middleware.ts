import type { KairoContext, Middleware } from './types.js'

export function compose(middlewares: Middleware[]): (ctx: KairoContext, next?: () => Promise<void>) => Promise<void> {
  for (const mw of middlewares) {
    if (typeof mw !== 'function') {
      throw new TypeError('Middleware must be a function')
    }
  }

  return function composed(ctx: KairoContext, finalNext?: () => Promise<void>): Promise<void> {
    let index = -1

    function dispatch(i: number): Promise<void> {
      if (i <= index) {
        return Promise.reject(new Error('next() called multiple times'))
      }
      index = i

      const fn = i === middlewares.length ? finalNext : middlewares[i]
      if (!fn) return Promise.resolve()

      try {
        return Promise.resolve(fn(ctx, () => dispatch(i + 1))).then(() => undefined)
      } catch (err) {
        return Promise.reject(err)
      }
    }

    return dispatch(0)
  }
}
