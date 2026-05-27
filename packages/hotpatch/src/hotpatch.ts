import type { KairoContext, KairoPlugin, Middleware } from '@thekairojs/kairo'

export interface HotpatchOptions {
  onPatch?: (id: string, middleware: Middleware) => void
  onUnpatch?: (id: string) => void
}

export interface HotpatchBus extends KairoPlugin {
  /**
   * Install a named middleware patch. If a patch with this id already exists,
   * it is atomically replaced in-place (preserving order). New patches are
   * appended to the end of the active patch list.
   */
  patch(id: string, middleware: Middleware): void

  /**
   * Remove a named patch. No-op if the id is not registered.
   */
  unpatch(id: string): void

  /**
   * Return the ordered list of active patch ids.
   */
  list(): string[]
}

export function createHotpatchBus(options: HotpatchOptions = {}): HotpatchBus {
  // Order is maintained in an array; the map provides O(1) lookup.
  const slots = new Map<string, Middleware>()
  const order: string[] = []

  const onRequest: Middleware = async (ctx: KairoContext, next: () => Promise<void>) => {
    if (order.length === 0) {
      await next()
      return
    }

    const active = order.map(id => slots.get(id)).filter((m): m is Middleware => m !== undefined)

    const run = async (i: number): Promise<void> => {
      if (i >= active.length) {
        await next()
        return
      }
      await active[i]!(ctx, () => run(i + 1))
    }

    await run(0)
  }

  return {
    name: 'kairo-hotpatch',
    version: '1.1.0',
    onRequest,

    patch(id: string, middleware: Middleware): void {
      if (!slots.has(id)) {
        order.push(id)
      }
      slots.set(id, middleware)
      options.onPatch?.(id, middleware)
    },

    unpatch(id: string): void {
      if (slots.delete(id)) {
        const idx = order.indexOf(id)
        if (idx !== -1) order.splice(idx, 1)
        options.onUnpatch?.(id)
      }
    },

    list(): string[] {
      return [...order]
    },
  }
}
