import type {
  KairoContext,
  KairoRequest,
  KairoResponse,
  KairoSecurityContext,
  HttpMethod,
  SecurityEvent,
} from './types.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

// Keys that must never be assigned on a null-prototype object to prevent pollution
const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty'])

function parseQueryString(search: string): Record<string, string | undefined> {
  // Use Object.create(null) to avoid prototype pollution
  const params = Object.create(null) as Record<string, string | undefined>
  if (!search) return params

  const queryString = search.startsWith('?') ? search.slice(1) : search
  if (!queryString) return params

  for (const pair of queryString.split('&')) {
    const eqIdx = pair.indexOf('=')
    if (eqIdx === -1) {
      const key = decodeURIComponent(pair)
      if (BLOCKED_KEYS.has(key)) continue
      params[key] = ''
    } else {
      const key = decodeURIComponent(pair.slice(0, eqIdx))
      if (BLOCKED_KEYS.has(key)) continue
      const value = decodeURIComponent(pair.slice(eqIdx + 1))
      params[key] = value
    }
  }
  return params
}

/**
 * Sanitize a header name or value by stripping CRLF and null bytes that could
 * enable HTTP response splitting / header injection.
 */
function sanitizeHeaderValue(s: string): string {
  return s.replace(/[\r\n\0]/g, '')
}

// Simple IPv4 / IPv6 validation for trusted proxy extraction
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/
const IPV6_RE = /^[\da-fA-F:]+$/

function isValidIp(ip: string): boolean {
  return IPV4_RE.test(ip) || IPV6_RE.test(ip)
}

export function extractIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for']
    if (typeof forwarded === 'string') {
      const first = forwarded.split(',')[0]?.trim()
      if (first && isValidIp(first)) return first
    }
  }
  return req.socket.remoteAddress ?? '127.0.0.1'
}

export function createRequest(raw: IncomingMessage, trustProxy = false): KairoRequest {
  const urlString = raw.url ?? '/'
  const qIdx = urlString.indexOf('?')
  const path = qIdx === -1 ? urlString : urlString.slice(0, qIdx)
  const search = qIdx === -1 ? '' : urlString.slice(qIdx)

  return {
    method: (raw.method?.toUpperCase() ?? 'GET') as HttpMethod,
    url: urlString,
    path: path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path,
    query: parseQueryString(search),
    params: {},
    headers: raw.headers as Record<string, string | string[] | undefined>,
    ip: extractIp(raw, trustProxy),
    body: undefined,
    raw,
  }
}

export function createResponse(raw: ServerResponse): KairoResponse {
  return {
    raw,
    statusCode: 200,
    headers: {},
    body: undefined,
    sent: false,
    pendingFlush: false,
  }
}

export function flushResponse(res: KairoResponse): void {
  if (res.sent) return
  if (!res.pendingFlush) return
  writeResponse(res)
}

export function createSecurityContext(): KairoSecurityContext {
  return {
    entropy: 0.0,
    taintedPaths: new Set(),
    ghostRouteTriggered: false,
    hardeningActive: false,
    overrides: [],
    events: [],
    lattice: { claims: null, resolved: false },
    intent: { type: 'unknown', confidence: 0, signals: [], resolved: false },
  }
}

export function createContext(
  req: KairoRequest,
  res: KairoResponse,
  params: Record<string, string>,
): KairoContext {
  const security = createSecurityContext()

  const mutableReq = req as { -readonly [K in keyof KairoRequest]: KairoRequest[K] }
  ;(mutableReq as { params: Record<string, string> }).params = params

  const ctx: KairoContext = {
    req,
    res,
    kairo: security,

    get method() { return req.method },
    get path() { return req.path },
    get url() { return req.url },
    get query() { return req.query },
    get params() { return params },
    get headers() { return req.headers },
    get ip() { return req.ip },
    get body() { return req.body },
    set body(value: unknown) { req.body = value },

    state: {},

    json(data: unknown, status?: number) {
      if (res.sent) return
      if (status !== undefined) res.statusCode = status
      res.headers['content-type'] = 'application/json; charset=utf-8'
      res.body = JSON.stringify(data)
      res.pendingFlush = true
    },

    text(data: string, status?: number) {
      if (res.sent) return
      if (status !== undefined) res.statusCode = status
      res.headers['content-type'] = 'text/plain; charset=utf-8'
      res.body = data
      res.pendingFlush = true
    },

    html(data: string, status?: number) {
      if (res.sent) return
      if (status !== undefined) res.statusCode = status
      res.headers['content-type'] = 'text/html; charset=utf-8'
      res.body = data
      res.pendingFlush = true
    },

    send(data: unknown, status?: number) {
      if (res.sent) return
      if (status !== undefined) res.statusCode = status

      if (typeof data === 'string') {
        res.headers['content-type'] = res.headers['content-type'] ?? 'text/plain; charset=utf-8'
        res.body = data
      } else if (Buffer.isBuffer(data)) {
        res.headers['content-type'] = res.headers['content-type'] ?? 'application/octet-stream'
        res.body = data
      } else if (data !== null && data !== undefined) {
        res.headers['content-type'] = 'application/json; charset=utf-8'
        res.body = JSON.stringify(data)
      }

      res.pendingFlush = true
    },

    status(code: number) {
      res.statusCode = code
      return ctx
    },

    set(name: string, value: string) {
      // C2: sanitize header name and value to prevent CRLF injection
      res.headers[sanitizeHeaderValue(name).toLowerCase()] = sanitizeHeaderValue(value)
      return ctx
    },

    get(name: string) {
      return req.headers[name.toLowerCase()]
    },

    /**
     * WARNING: Validate url before redirecting. Never pass user-controlled input directly.
     * Protocol-relative URLs (starting with //) are rejected as they enable open redirects.
     */
    redirect(url: string, status = 302) {
      if (res.sent) return
      // M2: reject protocol-relative URLs and CRLF sequences
      if (url.startsWith('//')) {
        throw new Error('Redirect to protocol-relative URL is not allowed (open redirect risk)')
      }
      if (/[\r\n]/.test(url)) {
        throw new Error('Redirect URL contains invalid characters')
      }
      res.statusCode = status
      // C2: sanitize the location URL value
      res.headers['location'] = sanitizeHeaderValue(url)
      res.body = ''
      res.pendingFlush = true
    },
  }

  return ctx
}

function writeResponse(res: KairoResponse): void {
  if (res.sent) return
  res.sent = true

  const raw = res.raw

  for (const [key, value] of Object.entries(res.headers)) {
    raw.setHeader(key, value)
  }

  raw.writeHead(res.statusCode)

  if (res.body !== undefined && res.body !== null) {
    if (Buffer.isBuffer(res.body)) {
      raw.end(res.body)
    } else if (typeof res.body === 'string') {
      raw.end(res.body)
    } else {
      raw.end(String(res.body))
    }
  } else {
    raw.end()
  }
}

export function emitSecurityEvent(ctx: KairoContext, event: Omit<SecurityEvent, 'timestamp' | 'entropy'>): void {
  const fullEvent: SecurityEvent = {
    ...event,
    timestamp: Date.now(),
    entropy: ctx.kairo.entropy,
  }
  ctx.kairo.events.push(fullEvent)
}
