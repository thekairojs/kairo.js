import type { KairoContext, Middleware, RiskLevel, TrustLevel } from '@thekairojs/kairo'
import { emitSecurityEvent } from '@thekairojs/kairo'
import { meetsLevel } from './levels.js'

export interface SemanticCondition {
  risk?: RiskLevel | RiskLevel[]
  intent?: string | string[]
  /** Route must carry at least one of these tags. */
  tags?: string[]
  pathPrefix?: string
}

export interface SemanticEnforcement {
  minLevel?: TrustLevel
  roles?: string[]
  /** When true, all listed roles are required. Default: false (any one). */
  allRoles?: boolean
  onDeny?: (ctx: KairoContext, reason: string) => void | Promise<void>
}

export interface SemanticRule {
  when: SemanticCondition
  enforce: SemanticEnforcement
}

export interface SemanticGuardOptions {
  rules: SemanticRule[]
}

/**
 * Semantic Route Guard — evaluates declared route metadata (risk, intent, tags)
 * against a set of rules and enforces lattice-level access control.
 *
 * Requires `createLattice()` to run earlier in the middleware chain so that
 * `ctx.kairo.lattice.claims` is already resolved.
 *
 * Also requires the core route options to be in `ctx.state['kairo.route.options']`
 * (available from core ≥ 1.1.0 automatically).
 *
 * ```ts
 * const guard = createSemanticGuard({
 *   rules: [
 *     { when: { risk: 'critical' }, enforce: { minLevel: 'high' } },
 *     { when: { tags: ['pii'] },    enforce: { minLevel: 'medium', roles: ['data-reader'] } },
 *   ]
 * })
 * app.use(lattice)
 * app.use(guard)
 * ```
 */
export function createSemanticGuard(options: SemanticGuardOptions): Middleware {
  const { rules } = options

  return async (ctx: KairoContext, next: () => Promise<void>) => {
    const routeOpts = ctx.state['kairo.route.options'] as Record<string, unknown> | undefined

    for (const rule of rules) {
      if (!_matches(rule.when, routeOpts, ctx)) continue

      const deny = await _enforce(rule.enforce, ctx)
      if (deny) return
    }

    await next()
  }
}

/**
 * Factory for a single-route semantic enforcement middleware.
 * Use this when you want to declare semantics inline at route registration
 * without needing global middleware.
 *
 * ```ts
 * app.get('/payments', semanticCheck({ risk: 'high', minLevel: 'medium' }), handler)
 * ```
 */
export function semanticCheck(
  opts: SemanticCondition & SemanticEnforcement,
): Middleware {
  return async (ctx: KairoContext, next: () => Promise<void>) => {
    const { risk, intent, tags, pathPrefix, minLevel, roles, allRoles, onDeny } = opts
    const condition: SemanticCondition = { risk, intent, tags, pathPrefix }
    const enforcement: SemanticEnforcement = { minLevel, roles, allRoles, onDeny }

    if (_matches(condition, undefined, ctx)) {
      const deny = await _enforce(enforcement, ctx)
      if (deny) return
    }
    await next()
  }
}

function _matches(
  when: SemanticCondition,
  routeOpts: Record<string, unknown> | undefined,
  ctx: KairoContext,
): boolean {
  const opts = routeOpts ?? {}

  if (when.risk !== undefined) {
    const risks = Array.isArray(when.risk) ? when.risk : [when.risk]
    const routeRisk = opts['risk'] as string | undefined
    if (!routeRisk || !risks.includes(routeRisk as RiskLevel)) return false
  }

  if (when.intent !== undefined) {
    const intents = Array.isArray(when.intent) ? when.intent : [when.intent]
    const routeIntent = opts['intent'] as string | undefined
    if (!routeIntent || !intents.includes(routeIntent)) return false
  }

  if (when.tags !== undefined && when.tags.length > 0) {
    const routeTags = opts['tags'] as string[] | undefined
    if (!routeTags) return false
    const hasTag = when.tags.some(t => routeTags.includes(t))
    if (!hasTag) return false
  }

  if (when.pathPrefix !== undefined) {
    if (!ctx.path.startsWith(when.pathPrefix)) return false
  }

  return true
}

async function _enforce(enforcement: SemanticEnforcement, ctx: KairoContext): Promise<boolean> {
  const { minLevel, roles = [], allRoles = false, onDeny } = enforcement
  const claims = ctx.kairo.lattice.claims

  if (minLevel !== undefined) {
    const actualLevel = claims?.level ?? 'none'
    if (!meetsLevel(actualLevel, minLevel)) {
      await _deny(ctx, `semantic guard: requires trust level '${minLevel}', got '${actualLevel}'`, onDeny)
      return true
    }
  }

  if (roles.length > 0 && claims) {
    const satisfied = allRoles
      ? roles.every(r => claims.roles.includes(r))
      : roles.some(r => claims.roles.includes(r))

    if (!satisfied) {
      const qualifier = allRoles ? 'all of' : 'one of'
      await _deny(ctx, `semantic guard: missing required roles (needs ${qualifier}: [${roles.join(', ')}])`, onDeny)
      return true
    }
  } else if (roles.length > 0 && !claims) {
    await _deny(ctx, 'semantic guard: lattice claims not resolved — add createLattice() before this guard', onDeny)
    return true
  }

  return false
}

async function _deny(
  ctx: KairoContext,
  reason: string,
  onDeny?: (ctx: KairoContext, reason: string) => void | Promise<void>,
): Promise<void> {
  ctx.kairo.entropy = Math.min(ctx.kairo.entropy + 0.35, 1.0)
  emitSecurityEvent(ctx, { type: 'lattice_denied', route: ctx.path, detail: reason })

  if (onDeny) {
    await onDeny(ctx, reason)
  } else {
    ctx.json({ error: 'Forbidden' }, 403)
  }
}
