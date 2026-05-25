/**
 * Security regression tests — verify all critical/high fixes hold.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from '../index.js'
import { createRequest, createResponse, createContext, flushResponse } from '../context.js'
import type { KairoContext } from '../types.js'
import { parseBody } from '../body-parser.js'
import type { KairoApp } from '../app.js'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'

// ─── Helpers ───

function makeFakeRawReq(overrides: Partial<{
  method: string
  url: string
  headers: Record<string, string>
  socket: { remoteAddress: string }
}>): IncomingMessage {
  return Object.assign(Object.create(null), {
    method: overrides.method ?? 'GET',
    url: overrides.url ?? '/',
    headers: overrides.headers ?? {},
    socket: overrides.socket ?? { remoteAddress: '127.0.0.1' },
  }) as unknown as IncomingMessage
}

function makeBodyReq(body: string, contentType: string): IncomingMessage {
  const stream = Readable.from([Buffer.from(body, 'utf-8')])
  return Object.assign(stream, {
    headers: { 'content-type': contentType },
  }) as unknown as IncomingMessage
}

const BASE_PORT = 3200

async function request(
  port: number,
  method: string,
  path: string,
  options: { body?: string; headers?: Record<string, string>; rawBody?: string } = {},
): Promise<{ status: number; headers: Record<string, string>; body: unknown; text: string }> {
  const url = `http://127.0.0.1:${port}${path}`
  const init: RequestInit = { method, headers: { accept: 'application/json', ...options.headers } }
  if (options.rawBody !== undefined) {
    init.body = options.rawBody
  } else if (options.body !== undefined) {
    init.body = JSON.stringify(options.body)
    ;(init.headers as Record<string, string>)['content-type'] = 'application/json'
  }
  const res = await fetch(url, init)
  const text = await res.text()
  let body: unknown = text
  try { body = JSON.parse(text) } catch { /* not JSON */ }
  const headers: Record<string, string> = {}
  res.headers.forEach((v, k) => { headers[k] = v })
  return { status: res.status, headers, body, text }
}

// ─── C1: Prototype pollution in parseQueryString ───

describe('C1 – Prototype pollution in query string', () => {
  it('does not pollute Object.prototype via __proto__ key', () => {
    const raw = makeFakeRawReq({ url: '/?__proto__[x]=1&normal=yes' })
    const req = createRequest(raw)
    // __proto__ key must be silently dropped
    expect((Object.prototype as Record<string, unknown>)['x']).toBeUndefined()
    expect(req.query['normal']).toBe('yes')
    expect(req.query['__proto__']).toBeUndefined()
  })

  it('does not pollute via constructor key', () => {
    const raw = makeFakeRawReq({ url: '/?constructor=evil' })
    const req = createRequest(raw)
    expect(req.query['constructor']).toBeUndefined()
  })
})

// ─── C1: Prototype pollution in parseUrlEncoded ───

describe('C1 – Prototype pollution in URL-encoded body', () => {
  it('does not pollute Object.prototype via __proto__ in POST body', async () => {
    const req = makeBodyReq('__proto__[x]=1&name=safe', 'application/x-www-form-urlencoded')
    const body = await parseBody(req) as Record<string, string>
    expect((Object.prototype as Record<string, unknown>)['x']).toBeUndefined()
    expect(body['name']).toBe('safe')
    expect(body['__proto__']).toBeUndefined()
  })

  it('does not pollute via constructor key in POST body', async () => {
    const req = makeBodyReq('constructor=evil&ok=1', 'application/x-www-form-urlencoded')
    const body = await parseBody(req) as Record<string, string>
    expect(body['constructor']).toBeUndefined()
    expect(body['ok']).toBe('1')
  })
})

// ─── C2: CRLF header injection ───

function makeFakeServerResponse(): { res: ServerResponse; captured: Record<string, string> } {
  const captured: Record<string, string> = {}
  const res = Object.assign(Object.create(null), {
    headersSent: false,
    setHeader(name: string, value: string) { captured[name] = value },
    writeHead() {},
    end() {},
  }) as unknown as ServerResponse
  return { res, captured }
}

describe('C2 – CRLF header injection in ctx.set()', () => {
  it('sanitizes CRLF from header name — no injected headers appear', () => {
    const raw = makeFakeRawReq({})
    const req = createRequest(raw)
    const { res: rawRes } = makeFakeServerResponse()
    const res = createResponse(rawRes)
    const ctx = createContext(req, res, {})

    // CRLF in the name should be stripped — 'X-H\r\nFoo' becomes 'x-hfoo' (lowercased)
    ctx.set('X-H\r\nFoo', 'test-value')
    flushResponse(res)

    // No key in the stored headers should contain CRLF
    const keys = Object.keys(ctx.res.headers)
    const hasInjected = keys.some(k => k.includes('\r') || k.includes('\n'))
    expect(hasInjected).toBe(false)
  })

  it('sanitizes CRLF from header value', () => {
    const raw = makeFakeRawReq({})
    const req = createRequest(raw)
    const { res: rawRes } = makeFakeServerResponse()
    const res = createResponse(rawRes)
    const ctx = createContext(req, res, {})

    ctx.set('X-Custom', 'value\r\nInjected: evil')
    // Check the value stored in res.headers — CRLF must be stripped
    const storedValue = ctx.res.headers['x-custom']
    expect(storedValue).toBe('valueInjected: evil')
    expect(storedValue).not.toMatch(/[\r\n]/)
  })
})

// ─── H1: Body not parsed for unmatched routes ───

describe('H1 – Body parsing only on matched routes', () => {
  let app: KairoApp
  const port = BASE_PORT + 1
  let bodyParsed = false

  beforeAll(async () => {
    app = createApp() as KairoApp
    // Only register /existing — not /missing
    app.post('/existing', (ctx: KairoContext) => {
      bodyParsed = true
      ctx.json({ parsed: true })
    })
    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('does not parse body for unmatched POST routes', async () => {
    bodyParsed = false
    const res = await request(port, 'POST', '/missing', {
      headers: { 'content-type': 'application/json' },
      rawBody: JSON.stringify({ data: 'x'.repeat(10_000) }),
    })
    expect(res.status).toBe(404)
    expect(bodyParsed).toBe(false)
  })
})

// ─── H2: Ghost routes no longer shadow real /admin routes ───

describe('H2 – Ghost routes do not shadow real routes', () => {
  let app: KairoApp
  const port = BASE_PORT + 2

  beforeAll(async () => {
    app = createApp() as KairoApp
    // Register a real /admin route — it must NOT be shadowed by the default ghost list
    app.get('/admin', (ctx: KairoContext) => ctx.json({ real: true }))
    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('real /admin route wins over ghost routes', async () => {
    const res = await request(port, 'GET', '/admin')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ real: true })
  })

  it('/.env still returns ghost response (not in real routes)', async () => {
    const res = await request(port, 'GET', '/.env')
    expect(res.status).toBe(200)
  })
})

// ─── H5: HEAD request returns no body but correct headers ───

describe('H5 – HEAD request strips body', () => {
  let app: KairoApp
  const port = BASE_PORT + 3

  beforeAll(async () => {
    app = createApp() as KairoApp
    app.get('/data', (ctx: KairoContext) => ctx.json({ hello: 'world' }))
    app.head('/data', (ctx: KairoContext) => ctx.json({ hello: 'world' }))
    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('HEAD response has no body', async () => {
    const res = await request(port, 'HEAD', '/data')
    expect(res.status).toBe(200)
    expect(res.text).toBe('')
  })

  it('HEAD response has content-length header', async () => {
    const res = await request(port, 'HEAD', '/data')
    // content-length should be set to the would-be body size
    expect(Number(res.headers['content-length'])).toBeGreaterThan(0)
  })
})

// ─── C5: trustProxy false ignores XFF ───

describe('C5 – trustProxy IP extraction', () => {
  it('createApp({ trustProxy: false }) uses socket IP regardless of XFF', () => {
    const raw = makeFakeRawReq({
      headers: { 'x-forwarded-for': '1.2.3.4' },
      socket: { remoteAddress: '192.168.0.1' },
    })
    // trustProxy defaults to false
    const req = createRequest(raw, false)
    expect(req.ip).toBe('192.168.0.1')
  })

  it('createApp({ trustProxy: true }) uses XFF first IP when present', () => {
    const raw = makeFakeRawReq({
      headers: { 'x-forwarded-for': '10.0.0.5, 10.0.0.6' },
      socket: { remoteAddress: '192.168.0.1' },
    })
    const req = createRequest(raw, true)
    expect(req.ip).toBe('10.0.0.5')
  })

  it('createApp({ trustProxy: true }) rejects invalid IP in XFF and falls back to socket', () => {
    const raw = makeFakeRawReq({
      headers: { 'x-forwarded-for': 'not-an-ip, 10.0.0.6' },
      socket: { remoteAddress: '192.168.0.1' },
    })
    const req = createRequest(raw, true)
    // 'not-an-ip' fails validation, should fall back to socket
    expect(req.ip).toBe('192.168.0.1')
  })
})
