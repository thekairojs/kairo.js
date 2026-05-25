import { describe, it, expect } from 'vitest'
import { createContext, createRequest, createResponse, flushResponse } from '../context.js'
import type { IncomingMessage, ServerResponse } from 'node:http'

function makeFakeRawReq(overrides: Partial<{
  method: string
  url: string
  headers: Record<string, string>
  socket: { remoteAddress: string }
}>): IncomingMessage {
  const req = Object.assign(Object.create(null), {
    method: overrides.method ?? 'GET',
    url: overrides.url ?? '/',
    headers: overrides.headers ?? {},
    socket: overrides.socket ?? { remoteAddress: '127.0.0.1' },
  })
  return req as unknown as IncomingMessage
}

function makeFakeRawRes(): { res: ServerResponse; written: { status: number | null; body: string; headers: Record<string, string> } } {
  const written = { status: null as number | null, body: '', headers: {} as Record<string, string> }

  const res = Object.assign(Object.create(null), {
    headersSent: false,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      written.headers[name] = value
    },
    writeHead(status: number) {
      written.status = status
    },
    end(body?: string | Buffer) {
      if (body) written.body += typeof body === 'string' ? body : body.toString()
    },
  })
  return { res: res as unknown as ServerResponse, written }
}

describe('createRequest', () => {
  it('parses method and path', () => {
    const raw = makeFakeRawReq({ method: 'POST', url: '/users' })
    const req = createRequest(raw)
    expect(req.method).toBe('POST')
    expect(req.path).toBe('/users')
  })

  it('strips trailing slash from path', () => {
    const raw = makeFakeRawReq({ url: '/users/' })
    const req = createRequest(raw)
    expect(req.path).toBe('/users')
  })

  it('preserves root path', () => {
    const raw = makeFakeRawReq({ url: '/' })
    const req = createRequest(raw)
    expect(req.path).toBe('/')
  })

  it('parses query string', () => {
    const raw = makeFakeRawReq({ url: '/search?q=hello&limit=10' })
    const req = createRequest(raw)
    expect(req.query['q']).toBe('hello')
    expect(req.query['limit']).toBe('10')
  })

  it('decodes URL-encoded query values', () => {
    const raw = makeFakeRawReq({ url: '/search?q=hello%20world' })
    const req = createRequest(raw)
    expect(req.query['q']).toBe('hello world')
  })

  it('extracts IP from socket', () => {
    const raw = makeFakeRawReq({ socket: { remoteAddress: '192.168.1.1' } })
    const req = createRequest(raw)
    expect(req.ip).toBe('192.168.1.1')
  })

  it('extracts IP from x-forwarded-for header when trustProxy is true', () => {
    const raw = makeFakeRawReq({ headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' } })
    const req = createRequest(raw, true)
    expect(req.ip).toBe('10.0.0.1')
  })

  it('ignores x-forwarded-for header when trustProxy is false (default)', () => {
    const raw = makeFakeRawReq({
      headers: { 'x-forwarded-for': '1.2.3.4' },
      socket: { remoteAddress: '192.168.1.1' },
    })
    const req = createRequest(raw, false)
    expect(req.ip).toBe('192.168.1.1')
  })
})

describe('KairoContext', () => {
  function makeCtx(urlOverride?: string) {
    const rawReq = makeFakeRawReq({ url: urlOverride ?? '/' })
    const req = createRequest(rawReq)
    const { res: rawRes, written } = makeFakeRawRes()
    const res = createResponse(rawRes)
    const ctx = createContext(req, res, { id: '42' })
    return { ctx, written }
  }

  it('exposes params', () => {
    const { ctx } = makeCtx()
    expect(ctx.params['id']).toBe('42')
  })

  it('ctx.json() sends JSON response', () => {
    const { ctx, written } = makeCtx()
    ctx.json({ ok: true })
    flushResponse(ctx.res)
    expect(written.status).toBe(200)
    expect(JSON.parse(written.body)).toEqual({ ok: true })
    expect(written.headers['content-type']).toContain('application/json')
  })

  it('ctx.json() respects custom status code', () => {
    const { ctx, written } = makeCtx()
    ctx.json({ created: true }, 201)
    flushResponse(ctx.res)
    expect(written.status).toBe(201)
  })

  it('ctx.text() sends text response', () => {
    const { ctx, written } = makeCtx()
    ctx.text('hello', 200)
    flushResponse(ctx.res)
    expect(written.body).toBe('hello')
    expect(written.headers['content-type']).toContain('text/plain')
  })

  it('ctx.html() sends html response', () => {
    const { ctx, written } = makeCtx()
    ctx.html('<h1>Hi</h1>')
    flushResponse(ctx.res)
    expect(written.headers['content-type']).toContain('text/html')
  })

  it('ctx.status().send() chains correctly', () => {
    const { ctx, written } = makeCtx()
    ctx.status(204).send(undefined)
    flushResponse(ctx.res)
    expect(written.status).toBe(204)
  })

  it('ctx.set() and ctx.get() manage headers', () => {
    const { ctx } = makeCtx()
    ctx.set('X-Custom', 'value')
    expect(ctx.res.headers['x-custom']).toBe('value')
  })

  it('does not send a response twice', () => {
    const { ctx, written } = makeCtx()
    ctx.json({ first: true })
    flushResponse(ctx.res) // flush marks as sent
    ctx.json({ second: true }) // ignored — already sent
    flushResponse(ctx.res) // no-op
    expect(written.body).toBe(JSON.stringify({ first: true }))
  })

  it('ctx.redirect() sets location header', () => {
    const { ctx, written } = makeCtx()
    ctx.redirect('/new-path')
    flushResponse(ctx.res)
    expect(written.status).toBe(302)
    expect(written.headers['location']).toBe('/new-path')
  })

  it('ctx.redirect() respects custom status', () => {
    const { ctx, written } = makeCtx()
    ctx.redirect('/new-path', 301)
    flushResponse(ctx.res)
    expect(written.status).toBe(301)
  })

  it('ctx.kairo has initial security state', () => {
    const { ctx } = makeCtx()
    expect(ctx.kairo.entropy).toBe(0.0)
    expect(ctx.kairo.ghostRouteTriggered).toBe(false)
    expect(ctx.kairo.hardeningActive).toBe(false)
    expect(ctx.kairo.events).toHaveLength(0)
  })

  it('state is a mutable record', () => {
    const { ctx } = makeCtx()
    ctx.state['user'] = { id: 1 }
    expect(ctx.state['user']).toEqual({ id: 1 })
  })
})
