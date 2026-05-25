import type { KairoContext, KairoPlugin, Middleware, TrustClaims, TrustLevel } from 'kairo'
import { emitSecurityEvent } from 'kairo'
import { meetsLevel } from './levels.js'

export interface LatticeOptions {
  /**
   * Called once per request to extract trust claims from the incoming context
   * (e.g. verify a JWT, look up an API key, read a session).
   *
   * Return `{ level: 'none', roles: [] }` for anonymous / unauthenticated requests.
   * If this function throws, the request is treated as anonymous rather than erroring.
   */
  resolve: (ctx: KairoContext) => TrustClaims | Promise<TrustClaims>

  /**
   * Called when `require()` denies a request. Use this to customise the denial
   * response (e.g. redirect, custom error body, logging).
   *
   * If omitted, a plain `{ error: 'Forbidden', reason }` JSON 403 is sent.
   */
  onDeny?: (ctx: KairoContext, reason: string) => void | Promise<void>
}

export interface RequireOptions {
  /** Minimum trust level required. Default: 'low' (any authenticated request). */
  level?: TrustLevel
  /**
   * One or more role strings the caller must possess.
   * By default, at least ONE of the listed roles is sufficient.
   * Set `all: true` to require all of them.
   */
  roles?: string[]
  /** When true, the caller must have ALL listed roles. Default: false (any one). */
  all?: boolean
}

export interface LatticePlugin extends KairoPlugin {
  /**
   * Returns a middleware that enforces the given trust requirements.
   * Must be placed AFTER the lattice plugin in the middleware chain.
   *
   * Usage:
   * ```ts
   * const lattice = createLattice({ resolve: myResolver })
   * app.use(lattice)
   *
   * app.get('/admin', lattice.require({ level: 'high', roles: ['admin'] }), handler)
   * ```
   */
  require(opts?: RequireOptions): Middleware
}

export function createLattice(options: LatticeOptions): LatticePlugin {
  const { resolve, onDeny } = options

  const resolveMiddleware: Middleware = async (ctx: KairoContext, next: () => Promise<void>) => {
    // Idempotent — a prior plugin in the chain may have already resolved claims
    if (!ctx.kairo.lattice.resolved) {
      let claims: TrustClaims
      try {
        claims = await resolve(ctx)
      } catch {
        // Resolution failure → anonymous; never let a broken resolver crash the request
        claims = { level: 'none', roles: [] }
      }
      ctx.kairo.lattice = { claims, resolved: true }
    }
    await next()
  }

  const plugin: LatticePlugin = {
    name: 'kairo-lattice',
    version: '0.1.0',
    onRequest: resolveMiddleware,

    require(opts: RequireOptions = {}): Middleware {
      const requiredLevel = opts.level ?? 'low'
      const requiredRoles = opts.roles ?? []
      const requireAll = opts.all ?? false

      return async (ctx: KairoContext, next: () => Promise<void>) => {
        const lattice = ctx.kairo.lattice

        if (!lattice.resolved || lattice.claims === null) {
          await _deny(
            ctx,
            'Trust claims not resolved — ensure createLattice() middleware runs before require()',
            onDeny,
          )
          return
        }

        const { claims } = lattice

        if (!meetsLevel(claims.level, requiredLevel)) {
          await _deny(
            ctx,
            `Insufficient trust level: '${claims.level}' does not satisfy '${requiredLevel}'`,
            onDeny,
          )
          return
        }

        if (requiredRoles.length > 0) {
          const satisfied = requireAll
            ? requiredRoles.every(r => claims.roles.includes(r))
            : requiredRoles.some(r => claims.roles.includes(r))

          if (!satisfied) {
            const qualifier = requireAll ? 'all of' : 'one of'
            await _deny(
              ctx,
              `Missing required roles (needs ${qualifier}: [${requiredRoles.join(', ')}])`,
              onDeny,
            )
            return
          }
        }

        await next()
      }
    },
  }

  return plugin
}

async function _deny(
  ctx: KairoContext,
  reason: string,
  onDeny?: (ctx: KairoContext, reason: string) => void | Promise<void>,
): Promise<void> {
  ctx.kairo.entropy = Math.min(ctx.kairo.entropy + 0.4, 1.0)
  emitSecurityEvent(ctx, {
    type: 'lattice_denied',
    route: ctx.path,
    detail: reason,
  })

  if (onDeny) {
    await onDeny(ctx, reason)
  } else {
    ctx.json({ error: 'Forbidden', reason }, 403)
  }
}

// The lattice does not store trust claims in a cookie or session — that is the
// caller's responsibility. The resolve() function is the single extension point
// for integrating any auth scheme (JWT, API key, OAuth, mTLS, etc.).
