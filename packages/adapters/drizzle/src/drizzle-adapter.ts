import { emitSecurityEvent } from '@thekairojs/kairo'
import { createCanary, scanForCanary } from '@thekairojs/kairo-sentinel'
import type { KairoContext } from '@thekairojs/kairo'
import { KairoEntropyError } from './entropy-error.js'

export type { KairoEntropyError }

export interface DrizzleAdapterOptions {
  /**
   * Block queries when ctx.kairo.entropy is at or above this value.
   * Throws KairoEntropyError. Default: disabled.
   */
  entropyGate?: number
  /**
   * Scan query results for canary token leaks.
   * Default: false.
   */
  scanResults?: boolean
}

/**
 * Wrap a Drizzle `db` instance with KAIRO security features.
 *
 * Drizzle's query builder chains end in a Promise — we intercept at execution
 * time via `exec()`, keeping full TypeScript inference on the query itself.
 *
 * ```ts
 * import { drizzle } from 'drizzle-orm/node-postgres'
 * import { createDrizzleAdapter } from '@thekairojs/kairo-adapter-drizzle'
 *
 * const db = drizzle(pool)
 * const kd = createDrizzleAdapter(db, { entropyGate: 0.8 })
 *
 * app.get('/users', async (ctx) => {
 *   const users = await kd.exec(ctx, db.select().from(usersTable))
 *   ctx.json(users)
 * })
 *
 * // With canary injection on insert:
 * app.post('/users', async (ctx) => {
 *   const { name, email } = ctx.body as { name: string; email: string }
 *   const row = kd.withCanary({ name, email }, ctx)  // adds __k_c__ field
 *   await kd.insert(ctx, db.insert(usersTable).values(row))
 *   ctx.json({ ok: true }, 201)
 * })
 * ```
 */
export function createDrizzleAdapter<TDb extends object>(
  _db: TDb,
  options: DrizzleAdapterOptions = {},
) {
  const { entropyGate, scanResults = false } = options

  function gateCheck(ctx: KairoContext, label: string): void {
    if (entropyGate !== undefined && ctx.kairo.entropy >= entropyGate) {
      emitSecurityEvent(ctx, {
        type:   'entropy_spike',
        route:  ctx.path,
        detail: `Drizzle ${label} blocked: entropy ${ctx.kairo.entropy.toFixed(2)} >= gate ${entropyGate}`,
      })
      throw new KairoEntropyError(ctx.kairo.entropy, entropyGate)
    }
  }

  return {
    /**
     * Execute any Drizzle query (select, update, delete, etc.) with entropy
     * gating and optional result scanning.
     */
    async exec<R>(ctx: KairoContext, query: Promise<R>, label = 'exec'): Promise<R> {
      gateCheck(ctx, label)
      const result = await query
      if (scanResults && result !== null && result !== undefined) {
        scanForCanary(result, ctx)
      }
      return result
    },

    /**
     * Execute a Drizzle insert. Semantic alias for exec() — use with withCanary()
     * for full canary coverage on inserted rows.
     */
    async insert<R>(ctx: KairoContext, query: Promise<R>): Promise<R> {
      return this.exec(ctx, query, 'insert')
    },

    /**
     * Wrap a values object with a canary token before inserting.
     * The returned object has a `__k_c__` field that the sentinel recognises.
     *
     * ```ts
     * const row = kd.withCanary({ name: 'Alice', email: 'alice@example.com' }, ctx)
     * await kd.insert(ctx, db.insert(usersTable).values(row))
     * ```
     *
     * Your Drizzle schema must include a `__k_c__: text('__k_c__')` column.
     */
    withCanary<T extends Record<string, unknown>>(record: T, ctx?: KairoContext): T & { __k_c__: string } {
      return createCanary(record, ctx)
    },
  }
}
