import type {
  KairoAppInstance,
  KairoContext,
  KairoConfig,
  HttpMethod,
  Handler,
  Middleware,
  RouteOptions,
  RouteGroup,
  GhostRouteOptions,
  ErrorHandler,
  KairoPlugin,
  ServerAdapter,
} from './types.js'
import { Router } from './router.js'
import { createContext, createRequest, createResponse, flushResponse } from './context.js'
import { compose } from './middleware.js'
import { parseBody } from './body-parser.js'
import { createHttpAdapter, type RequestHandler } from './server.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']

interface GhostRoute {
  path: string
  response: unknown
  alertLevel: 'low' | 'medium' | 'high'
}

const DEFAULT_GHOST_ROUTES: GhostRoute[] = [
  { path: '/.env', response: '', alertLevel: 'high' },
  { path: '/.git/config', response: '', alertLevel: 'high' },
  { path: '/wp-admin', response: '<html><body>Not Found</body></html>', alertLevel: 'medium' },
  { path: '/wp-login.php', response: '<html><body>Not Found</body></html>', alertLevel: 'medium' },
  { path: '/.aws/credentials', response: '', alertLevel: 'high' },
  { path: '/phpinfo.php', response: '', alertLevel: 'medium' },
  { path: '/.DS_Store', response: '', alertLevel: 'low' },
  { path: '/backup.sql', response: '', alertLevel: 'high' },
  { path: '/dump.sql', response: '', alertLevel: 'high' },
]


function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/\s+at\s+.*/g, '')           // strip stack frames
    .replace(/\/[^\s:,]+/g, '[path]')     // strip absolute paths
    .trim()
}

export class KairoApp implements KairoAppInstance {
  private readonly router = new Router()
  private readonly globalMiddleware: Middleware[] = []
  private readonly ghostRoutes = new Map<string, GhostRoute>()
  private readonly plugins: KairoPlugin[] = []
  private errorHandler: ErrorHandler | null = null
  private notFoundHandler: Handler | null = null
  private adapter: ServerAdapter | null = null
  private readonly securityEventListeners: ((event: import('./types.js').SecurityEvent) => void)[] = []
  private readonly config: KairoConfig

  constructor(config: KairoConfig = {}) {
    this.config = config
    // H2: only register ghost routes when not disabled
    if (config.ghostRoutes !== false) {
      for (const ghost of DEFAULT_GHOST_ROUTES) {
        this.ghostRoutes.set(ghost.path, ghost)
      }
    }
  }

  // ─── Route Registration ───

  get(path: string, ...args: (Handler | Middleware | RouteOptions)[]): void {
    this.registerRoute('GET', path, args)
  }

  post(path: string, ...args: (Handler | Middleware | RouteOptions)[]): void {
    this.registerRoute('POST', path, args)
  }

  put(path: string, ...args: (Handler | Middleware | RouteOptions)[]): void {
    this.registerRoute('PUT', path, args)
  }

  delete(path: string, ...args: (Handler | Middleware | RouteOptions)[]): void {
    this.registerRoute('DELETE', path, args)
  }

  patch(path: string, ...args: (Handler | Middleware | RouteOptions)[]): void {
    this.registerRoute('PATCH', path, args)
  }

  head(path: string, ...args: (Handler | Middleware | RouteOptions)[]): void {
    this.registerRoute('HEAD', path, args)
  }

  options(path: string, ...args: (Handler | Middleware | RouteOptions)[]): void {
    this.registerRoute('OPTIONS', path, args)
  }

  // ─── Middleware ───

  use(middlewareOrPlugin: Middleware | KairoPlugin): void {
    if (typeof middlewareOrPlugin === 'function') {
      this.globalMiddleware.push(middlewareOrPlugin)
    } else {
      this.plugins.push(middlewareOrPlugin)
      if (middlewareOrPlugin.onRequest) {
        this.globalMiddleware.push(middlewareOrPlugin.onRequest)
      }
      if (middlewareOrPlugin.onSecurityEvent) {
        const listener = middlewareOrPlugin.onSecurityEvent
        this.securityEventListeners.push((event) => { listener(event) })
      }
      if (middlewareOrPlugin.install) {
        // H4: warn if install() returns a Promise — async plugins are not awaited here
        const result = middlewareOrPlugin.install(this)
        if (result instanceof Promise) {
          console.warn(
            `[kairo] Warning: plugin "${middlewareOrPlugin.name}" install() is async. ` +
            `Async plugin installation is not supported in use(). ` +
            `Call await app.installPlugin(plugin) instead.`
          )
        }
      }
    }
  }

  // ─── Route Groups ───

  group(prefix: string, options?: { middleware?: Middleware[] }): RouteGroup {
    const groupMiddleware = options?.middleware ?? []
    const app = this

    const grp: RouteGroup = {
      get(path, ...args) { app.registerRoute('GET', prefix + path, args, groupMiddleware) },
      post(path, ...args) { app.registerRoute('POST', prefix + path, args, groupMiddleware) },
      put(path, ...args) { app.registerRoute('PUT', prefix + path, args, groupMiddleware) },
      delete(path, ...args) { app.registerRoute('DELETE', prefix + path, args, groupMiddleware) },
      patch(path, ...args) { app.registerRoute('PATCH', prefix + path, args, groupMiddleware) },
      use(mw: Middleware) { groupMiddleware.push(mw) },
    }

    return grp
  }

  // ─── Ghost Routes ───

  ghost(path: string, options?: GhostRouteOptions): void {
    this.ghostRoutes.set(path, {
      path,
      response: options?.response ?? { status: 'ok' },
      alertLevel: options?.alertLevel ?? 'medium',
    })
  }

  // ─── Error Handling ───

  onError(handler: ErrorHandler): void {
    this.errorHandler = handler
  }

  onNotFound(handler: Handler): void {
    this.notFoundHandler = handler
  }

  // ─── Server ───

  async listen(port: number, hostname?: string): Promise<void> {
    const handler = this.buildRequestHandler()
    this.adapter = createHttpAdapter(handler)
    await this.adapter.listen(port, hostname)
  }

  async close(): Promise<void> {
    if (this.adapter) {
      await this.adapter.close()
      this.adapter = null
    }
  }

  // ─── Internal: Route Registration ───

  private registerRoute(
    method: HttpMethod,
    path: string,
    args: (Handler | Middleware | RouteOptions)[],
    groupMiddleware: Middleware[] = [],
  ): void {
    const { handler, middleware, options } = this.parseRouteArgs(args)
    this.router.add(method, path, handler, [...groupMiddleware, ...middleware], options)
  }

  private parseRouteArgs(
    args: (Handler | Middleware | RouteOptions)[],
  ): { handler: Handler; middleware: Middleware[]; options: Partial<RouteOptions> } {
    const middleware: Middleware[] = []
    let handler: Handler | null = null
    let options: Partial<RouteOptions> = {}

    // H6: Classification strategy — last function argument is the handler.
    // All prior functions are middleware. If only one function, it's the handler.
    // Objects with a `handler` key are RouteOptions.
    const fns: (Handler | Middleware)[] = []

    for (const arg of args) {
      if (typeof arg === 'function') {
        fns.push(arg as Handler | Middleware)
      } else if (typeof arg === 'object' && arg !== null) {
        const routeOpts = arg as RouteOptions
        if (routeOpts.handler) {
          handler = routeOpts.handler
          options = { ...routeOpts }
        }
      }
    }

    // Last function is the handler; all prior are middleware
    if (!handler && fns.length > 0) {
      handler = fns[fns.length - 1] as Handler
      for (let i = 0; i < fns.length - 1; i++) {
        middleware.push(fns[i] as Middleware)
      }
    }

    if (!handler) {
      throw new Error('Route requires a handler function')
    }

    return { handler, middleware, options }
  }

  // ─── Internal: Request Handling ───

  buildRequestHandler(): RequestHandler {
    return (rawReq: IncomingMessage, rawRes: ServerResponse) => {
      this.handleRequest(rawReq, rawRes).catch((err) => {
        if (!rawRes.headersSent) {
          rawRes.writeHead(500, { 'content-type': 'application/json' })
          rawRes.end(JSON.stringify({ error: 'Internal Server Error' }))
        }
        // Prevent unhandled rejection from crashing the process
        console.error('[kairo] Unhandled error:', err)
      })
    }
  }

  private async handleRequest(rawReq: IncomingMessage, rawRes: ServerResponse): Promise<void> {
    const req = createRequest(rawReq, this.config.trustProxy ?? false)
    const res = createResponse(rawRes)
    const ctx = createContext(req, res, {})

    try {
      // H2: Check the router FIRST — real routes win over ghost routes
      const match = this.router.find(req.method, req.path)

      if (match) {
        // H1: Only parse body when a route is matched (avoid wasteful parsing for 404s)
        if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
          try {
            req.body = await parseBody(rawReq)
          } catch (err) {
            const statusCode = (err as Error & { statusCode?: number }).statusCode ?? 400
            ctx.json({ error: (err as Error).message }, statusCode)
            flushResponse(res)
            return
          }
        }

        // Set params on context
        Object.assign(ctx.params, match.params)

        // H5: For HEAD requests, strip body after the full chain completes
        // Build middleware chain: global -> route-specific -> handler
        const allMiddleware: Middleware[] = [
          ...this.globalMiddleware,
          ...match.route.middleware,
        ]

        const handlerAsMiddleware: Middleware = async (c) => {
          const result = await match.route.handler(c)
          // Auto-send if handler returns data and response not sent
          if (result !== undefined && !c.res.sent) {
            // M4: Don't auto-serialize class instances — warn in dev instead
            if (
              result !== null &&
              typeof result === 'object' &&
              Object.getPrototypeOf(result) !== Object.prototype &&
              !Array.isArray(result)
            ) {
              console.warn(
                '[kairo:dev] Handler returned a class instance. ' +
                'Kairo will not auto-serialize it. Call ctx.json() explicitly.'
              )
              c.status(204).send(undefined)
            } else {
              c.json(result)
            }
          }
        }

        const chain = compose([...allMiddleware, handlerAsMiddleware])
        await chain(ctx)

        // H5: HEAD requests must not have a body — strip it after the chain
        if (req.method === 'HEAD' && res.body !== undefined) {
          // Set Content-Length to the would-be body length for accuracy
          const bodyBuf = Buffer.isBuffer(res.body)
            ? res.body
            : Buffer.from(typeof res.body === 'string' ? res.body : String(res.body))
          res.headers['content-length'] = String(bodyBuf.length)
          res.body = undefined
        }

        // Flush the buffered response after the full middleware chain has run.
        // This allows post-next() middleware to set headers before the socket write.
        if (!res.sent) {
          if (res.pendingFlush) {
            flushResponse(res)
          } else {
            ctx.status(204).send(undefined)
            flushResponse(res)
          }
        }
        return
      }

      // No route matched — check ghost routes (H2: ghost routes checked AFTER real routes)
      if (this.config.ghostRoutes !== false) {
        const ghost = this.ghostRoutes.get(req.path)
        if (ghost) {
          ctx.kairo.ghostRouteTriggered = true
          ctx.kairo.entropy = Math.min(ctx.kairo.entropy + 0.4, 1.0)

          const event: import('./types.js').SecurityEvent = {
            type: 'ghost_route_hit',
            route: req.path,
            detail: `Ghost route hit: ${req.path} (alert: ${ghost.alertLevel})`,
            timestamp: Date.now(),
            entropy: ctx.kairo.entropy,
          }
          ctx.kairo.events.push(event)
          for (const listener of this.securityEventListeners) {
            listener(event)
          }

          if (typeof ghost.response === 'string') {
            ctx.text(ghost.response, 200)
          } else {
            ctx.json(ghost.response, 200)
          }
          flushResponse(res)
          return
        }
      }

      // Check if route exists but method not allowed
      const allowed = this.router.getAllowedMethods(req.path)
      if (allowed.length > 0) {
        ctx.set('Allow', allowed.join(', '))
        ctx.json({ error: 'Method Not Allowed' }, 405)
        flushResponse(res)
        return
      }

      if (this.notFoundHandler) {
        await this.notFoundHandler(ctx)
        flushResponse(res)
      } else {
        ctx.json({ error: 'Not Found' }, 404)
        flushResponse(res)
      }
    } catch (err) {
      if (res.sent) return

      if (this.errorHandler) {
        try {
          await this.errorHandler(err as Error, ctx)
          if (!res.sent) {
            if (res.pendingFlush) {
              flushResponse(res)
            } else {
              // Error handler didn't respond — send a default 500
              ctx.json({ error: 'Internal Server Error' }, 500)
              flushResponse(res)
            }
          }
        } catch {
          if (!res.sent) {
            ctx.json({ error: 'Internal Server Error' }, 500)
            flushResponse(res)
          }
        }
      } else {
        const statusCode = (err as Error & { statusCode?: number }).statusCode ?? 500
        // H7: sanitize client-facing error messages to avoid leaking internal paths
        const rawMessage = statusCode < 500 ? (err as Error).message : 'Internal Server Error'
        const message = statusCode < 500 ? sanitizeErrorMessage(rawMessage) : rawMessage
        ctx.json({ error: message }, statusCode)
        flushResponse(res)
      }
    }
  }
}
