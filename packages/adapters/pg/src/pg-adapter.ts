import { emitSecurityEvent } from '@thekairojs/kairo'
import { createCanary, scanForCanary } from '@thekairojs/kairo-sentinel'
import type { KairoContext } from '@thekairojs/kairo'

// Minimal pg Pool surface — avoids importing pg types directly (peer dep)
interface PgPool {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>
}

export interface QueryResult<R extends Record<string, unknown> = Record<string, unknown>> {
  rows: R[]
  rowCount: number | null
}

export class KairoEntropyError extends Error {
  readonly entropy: number
  readonly threshold: number

  constructor(entropy: number, threshold: number) {
    super(
      `Query blocked: request entropy ${entropy.toFixed(2)} exceeds threshold ${threshold}. ` +
      'This request is flagged as high-risk.'
    )
    this.name = 'KairoEntropyError'
    this.entropy = entropy
    this.threshold = threshold
  }
}

export interface PgAdapterOptions {
  /**
   * Block queries when ctx.kairo.entropy is at or above this value.
   * Throws KairoEntropyError. Default: disabled.
   */
  entropyGate?: number
  /**
   * Scan query result rows for canary token leaks.
   * Default: false.
   */
  scanResults?: boolean
}

/**
 * Wrap a `pg` Pool with KAIRO security features.
 *
 * ```ts
 * import pg from 'pg'
 * import { createPgAdapter } from '@thekairojs/kairo-adapter-pg'
 *
 * const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
 * const kpg = createPgAdapter(pool, { entropyGate: 0.8, scanResults: true })
 *
 * app.get('/users/:id', async (ctx) => {
 *   const result = await kpg.query(ctx, 'SELECT * FROM users WHERE id = $1', [ctx.params.id])
 *   ctx.json(result.rows[0] ?? null)
 * })
 *
 * // Insert with canary (your table needs a __k_c__ text column):
 * app.post('/users', async (ctx) => {
 *   const { name, email } = ctx.body as { name: string; email: string }
 *   const row = kpg.withCanary({ name, email }, ctx)
 *   await kpg.query(ctx,
 *     'INSERT INTO users (name, email, __k_c__) VALUES ($1, $2, $3)',
 *     [row.name, row.email, row.__k_c__]
 *   )
 * })
 * ```
 */
export function createPgAdapter(pool: PgPool, options: PgAdapterOptions = {}) {
  const { entropyGate, scanResults = false } = options

  return {
    /**
     * Run a parameterised SQL query through the pool, with KAIRO entropy
     * gating and optional canary leak scanning on the returned rows.
     */
    async query<R extends Record<string, unknown> = Record<string, unknown>>(
      ctx: KairoContext,
      text: string,
      values?: unknown[],
    ): Promise<QueryResult<R>> {
      // ── Entropy gate ───────────────────────────────────────────────────────
      if (entropyGate !== undefined && ctx.kairo.entropy >= entropyGate) {
        emitSecurityEvent(ctx, {
          type:   'entropy_spike',
          route:  ctx.path,
          detail: `pg query blocked: entropy ${ctx.kairo.entropy.toFixed(2)} >= gate ${entropyGate}`,
        })
        throw new KairoEntropyError(ctx.kairo.entropy, entropyGate)
      }

      const result = await pool.query<R>(text, values)

      // ── Canary leak scan ──────────────────────────────────────────────────
      if (scanResults && result.rows.length > 0) {
        scanForCanary(result.rows, ctx)
      }

      return { rows: result.rows, rowCount: result.rowCount }
    },

    /**
     * Wrap a values object with a canary token before inserting.
     * The returned object has a `__k_c__` field that the sentinel recognises.
     *
     * ```ts
     * const row = kpg.withCanary({ name: 'Alice' }, ctx)
     * // row.__k_c__ is a registered canary token
     * ```
     */
    withCanary<T extends Record<string, unknown>>(record: T, ctx?: KairoContext): T & { __k_c__: string } {
      return createCanary(record, ctx)
    },
  }
}
