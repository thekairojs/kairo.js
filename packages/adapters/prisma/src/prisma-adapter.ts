import { emitSecurityEvent } from '@thekairojs/kairo'
import { createCanary, scanForCanary } from '@thekairojs/kairo-sentinel'
import type { KairoContext } from '@thekairojs/kairo'

// Operations that write rows — canary injection applies here
const WRITE_OPS = new Set(['create', 'createMany', 'upsert', 'update', 'updateMany'])

// Operations that return rows — canary scanning applies here
const READ_OPS = new Set([
  'findUnique', 'findUniqueOrThrow',
  'findFirst', 'findFirstOrThrow',
  'findMany', 'aggregate', 'groupBy', 'count',
  'create', 'createMany', 'upsert', 'update', 'updateMany',
])

// Canary field name that the sentinel uses internally
const CANARY_FIELD = '__k_c__'

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

export interface PrismaAdapterOptions {
  /**
   * Block queries when ctx.kairo.entropy is at or above this value.
   * Throws KairoEntropyError. Default: disabled.
   */
  entropyGate?: number
  /**
   * Prisma model names (lowercase) that should receive an automatic
   * canary token on create/upsert. The Prisma schema must have
   * a `__k_c__ String?` field on those models.
   */
  canaryModels?: string[]
  /**
   * Scan query results for canary token leaks.
   * Defaults to true when canaryModels is non-empty.
   */
  scanResults?: boolean
}

/**
 * Wrap a PrismaClient with KAIRO security features.
 *
 * ```ts
 * import { PrismaClient } from '@prisma/client'
 * import { createPrismaAdapter } from '@thekairojs/kairo-adapter-prisma'
 *
 * const prisma = new PrismaClient()
 * const kp = createPrismaAdapter(prisma, { canaryModels: ['user', 'order'] })
 *
 * // In a route handler:
 * app.get('/users/:id', async (ctx) => {
 *   const db = kp.withContext(ctx)
 *   const user = await db.user.findUnique({ where: { id: ctx.params.id } })
 *   ctx.json(user)
 * })
 * ```
 *
 * Canary injection requires a `__k_c__ String?` field in your Prisma schema
 * for each model listed in canaryModels.
 */
export function createPrismaAdapter<T extends object>(
  client: T,
  options: PrismaAdapterOptions = {},
): { withContext(ctx: KairoContext): T } {
  const {
    entropyGate,
    canaryModels = [],
    scanResults = canaryModels.length > 0,
  } = options

  function withContext(ctx: KairoContext): T {
    return new Proxy(client, {
      get(target, modelProp) {
        if (typeof modelProp !== 'string') return Reflect.get(target, modelProp)

        const delegate = (target as Record<string, unknown>)[modelProp]
        if (!delegate || typeof delegate !== 'object') return delegate

        const modelName = modelProp.toLowerCase()

        return new Proxy(delegate as object, {
          get(modelTarget, opProp) {
            const op = String(opProp)
            const fn = (modelTarget as Record<string, unknown>)[op]

            if (typeof fn !== 'function') return fn

            return async (...args: unknown[]) => {
              // ── Entropy gate ──────────────────────────────────────────────
              if (entropyGate !== undefined && ctx.kairo.entropy >= entropyGate) {
                emitSecurityEvent(ctx, {
                  type:   'entropy_spike',
                  route:  ctx.path,
                  detail: `Prisma query blocked on ${modelProp}.${op}: entropy ${ctx.kairo.entropy.toFixed(2)} >= gate ${entropyGate}`,
                })
                throw new KairoEntropyError(ctx.kairo.entropy, entropyGate)
              }

              // ── Canary injection (write ops on listed models) ─────────────
              if (WRITE_OPS.has(op) && canaryModels.includes(modelName)) {
                const arg = args[0] as Record<string, unknown> | undefined
                if (arg && typeof arg === 'object' && 'data' in arg) {
                  // createMany: data is an array of records
                  if (Array.isArray(arg['data'])) {
                    arg['data'] = (arg['data'] as Record<string, unknown>[]).map(row =>
                      row[CANARY_FIELD] ? row : createCanary(row, ctx)
                    )
                  } else if (arg['data'] && typeof arg['data'] === 'object') {
                    const data = arg['data'] as Record<string, unknown>
                    if (!data[CANARY_FIELD]) {
                      arg['data'] = createCanary(data, ctx)
                    }
                  }
                }
              }

              const result = await (fn as (...a: unknown[]) => Promise<unknown>).apply(modelTarget, args)

              // ── Canary leak scan ──────────────────────────────────────────
              if (scanResults && READ_OPS.has(op) && result !== null && result !== undefined) {
                scanForCanary(result, ctx)
              }

              return result
            }
          },
        })
      },
    }) as T
  }

  return { withContext }
}
