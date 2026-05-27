import type { KairoContext, KairoPlugin, Middleware } from '@thekairojs/kairo'
import { emitSecurityEvent } from '@thekairojs/kairo'
import { buildSignatureHeader, verifySignature } from './signing.js'
import { routeAllowed } from './routes.js'

export interface PeerConfig {
  /** Route patterns this peer is allowed to call on our service. */
  allowedRoutes: string[]
  /** Base URL for outbound calls to this peer (required for graph.call). */
  baseUrl?: string
}

export interface IntentGraphOptions {
  /** Name of this service. Included in outbound signatures. */
  service: string
  /** Shared HMAC-SHA-256 secret. Must match across all peers in the mesh. */
  secret: string
  /** Declared peer services and what routes they may call. */
  peers: Record<string, PeerConfig>
  /** Replay-attack window in ms. Default: 30_000 (30 s). */
  timestampWindow?: number
  /** Called when an inbound service call fails validation. */
  onViolation?: (ctx: KairoContext, peer: string, reason: string) => void | Promise<void>
}

export interface IntentGraphPlugin extends KairoPlugin {
  /**
   * Make a signed outbound service-to-service call.
   * The peer must be declared in `options.peers` and have a `baseUrl`.
   */
  call(peer: string, method: string, path: string, init?: RequestInit): Promise<Response>
}

const SERVICE_HEADER = 'x-kairo-service'
const SIG_HEADER = 'x-kairo-signature'

export function createIntentGraph(options: IntentGraphOptions): IntentGraphPlugin {
  const { service, secret, peers } = options
  const window = options.timestampWindow ?? 30_000

  const onRequest: Middleware = async (ctx: KairoContext, next: () => Promise<void>) => {
    const callerHeader = ctx.headers[SERVICE_HEADER]
    const sigHeader = ctx.headers[SIG_HEADER]

    // Not a service-to-service call — pass through
    if (!callerHeader || !sigHeader) {
      await next()
      return
    }

    const caller = Array.isArray(callerHeader) ? callerHeader[0] : callerHeader
    const sig    = Array.isArray(sigHeader)    ? sigHeader[0]    : sigHeader

    if (!caller || !sig) {
      await _reject(ctx, caller ?? 'unknown', 'malformed service headers', options.onViolation)
      return
    }

    const peerCfg = peers[caller]
    if (!peerCfg) {
      await _reject(ctx, caller, `undeclared peer '${caller}'`, options.onViolation)
      return
    }

    if (!routeAllowed(peerCfg.allowedRoutes, ctx.path)) {
      await _reject(ctx, caller, `path '${ctx.path}' not in declared routes for '${caller}'`, options.onViolation)
      return
    }

    const verify = verifySignature(secret, caller, ctx.method, ctx.path, sig, window)
    if (!verify.ok) {
      await _reject(ctx, caller, verify.reason ?? 'invalid signature', options.onViolation)
      return
    }

    ctx.state['kairo.service.caller'] = caller
    await next()
  }

  return {
    name: 'kairo-intent-graph',
    version: '1.1.0',
    onRequest,

    async call(peer: string, method: string, path: string, init: RequestInit = {}): Promise<Response> {
      const cfg = peers[peer]
      if (!cfg) throw new Error(`[intent-graph] Unknown peer '${peer}'. Declare it in options.peers.`)
      if (!cfg.baseUrl) throw new Error(`[intent-graph] Peer '${peer}' has no baseUrl configured.`)

      const sigHeader = buildSignatureHeader(secret, service, method, path)

      const headers = new Headers(init.headers)
      headers.set(SERVICE_HEADER, service)
      headers.set(SIG_HEADER, sigHeader)

      return fetch(`${cfg.baseUrl}${path}`, { ...init, method, headers })
    },
  }
}

async function _reject(
  ctx: KairoContext,
  peer: string,
  reason: string,
  onViolation?: IntentGraphOptions['onViolation'],
): Promise<void> {
  ctx.kairo.entropy = Math.min(ctx.kairo.entropy + 0.5, 1.0)
  emitSecurityEvent(ctx, {
    type: 'lattice_denied',
    route: ctx.path,
    detail: `[intent-graph] service='${peer}' — ${reason}`,
  })
  if (onViolation) {
    await onViolation(ctx, peer, reason)
  } else {
    ctx.json({ error: 'Forbidden' }, 403)
  }
}
