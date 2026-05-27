import type { KairoAppInstance, KairoContext, KairoPlugin, SecurityEvent } from '@thekairojs/kairo'
import { renderDashboard } from './html.js'

export interface DashboardOptions {
  /** Mount path for the dashboard. Default: '/kairo' */
  path?: string

  /**
   * Optional bearer token. When set, the dashboard and SSE endpoint require
   * `Authorization: Bearer <token>` or `?token=<token>`.
   */
  token?: string

  /** Maximum security events to buffer in memory. Default: 500 */
  maxEvents?: number
}

export interface DashboardPlugin extends KairoPlugin {
  /**
   * Install the plugin into an existing KairoApp. Registers all dashboard
   * routes and wires up security event capture.
   *
   * Equivalent to `app.use(dashboard)` — both trigger installation.
   */
  install(app: KairoAppInstance): void
}

export function createDashboard(options: DashboardOptions = {}): DashboardPlugin {
  const mountPath = (options.path ?? '/kairo').replace(/\/$/, '')
  const secret    = options.token
  const maxEvents = options.maxEvents ?? 500

  const eventBuffer: SecurityEvent[] = []
  const sseClients = new Set<import('node:http').ServerResponse>()
  let appRef: KairoAppInstance | null = null
  let installed = false

  function push(event: SecurityEvent): void {
    eventBuffer.push(event)
    if (eventBuffer.length > maxEvents) eventBuffer.shift()

    const data = `data: ${JSON.stringify(event)}\n\n`
    for (const res of sseClients) {
      try { res.write(data) } catch { sseClients.delete(res) }
    }
  }

  function isAuthorized(ctx: KairoContext): boolean {
    if (!secret) return true
    const auth = ctx.headers['authorization']
    const bearer = Array.isArray(auth) ? auth[0] : auth
    if (bearer === `Bearer ${secret}`) return true
    if (ctx.query['token'] === secret) return true
    return false
  }

  const plugin: DashboardPlugin = {
    name: 'kairo-dashboard',
    version: '1.1.0',

    onSecurityEvent(event: SecurityEvent): void {
      push(event)
    },

    install(app: KairoAppInstance): void {
      // Guard: app.use(plugin) calls install() automatically — prevent recursion
      // and re-registration if install() is also called manually.
      if (installed) return
      installed = true
      appRef = app

      // ── Dashboard HTML
      app.get(mountPath, (ctx: KairoContext) => {
        if (!isAuthorized(ctx)) { ctx.json({ error: 'Unauthorized' }, 401); return }
        const routes = appRef?.getRoutes() ?? []
        ctx.set('Content-Type', 'text/html; charset=utf-8')
        ctx.set('Cache-Control', 'no-store')
        ctx.text(renderDashboard(routes, mountPath))
      })

      // ── Route list JSON
      app.get(`${mountPath}/routes`, (ctx: KairoContext) => {
        if (!isAuthorized(ctx)) { ctx.json({ error: 'Unauthorized' }, 401); return }
        const routes = appRef?.getRoutes() ?? []
        ctx.json(routes.map(r => ({
          method: r.method,
          path: r.path,
          risk: r.options.risk,
          intent: r.options.intent,
          trust: r.options.trust,
          tags: r.options.tags,
        })))
      })

      // ── SSE event stream (writes directly to the raw socket)
      app.get(`${mountPath}/events`, (ctx: KairoContext) => {
        if (!isAuthorized(ctx)) { ctx.json({ error: 'Unauthorized' }, 401); return }

        const raw = ctx.res.raw
        raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        })
        raw.write(':\n\n')
        for (const ev of eventBuffer) {
          raw.write(`data: ${JSON.stringify(ev)}\n\n`)
        }
        sseClients.add(raw)
        ctx.req.raw.socket?.once('close', () => sseClients.delete(raw))
        ctx.res.sent = true
      })
    },
  }

  return plugin
}
