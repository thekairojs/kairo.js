import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from 'kairo'
import { validate, devLogger } from '../index.js'
import type { KairoContext } from 'kairo'

const BASE_PORT = 3900

async function req(
  port: number,
  method: string,
  path: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: unknown }> {
  const url = `http://127.0.0.1:${port}${path}`
  const init: RequestInit = { method, headers: { ...options.headers } }
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body)
    ;(init.headers as Record<string, string>)['content-type'] = 'application/json'
  }
  const res = await fetch(url, init)
  const text = await res.text()
  let body: unknown = text
  try { body = JSON.parse(text) } catch { /* plain */ }
  return { status: res.status, body }
}

// ─── Body validation ──────────────────────────────────────────────────────────

describe('DX — body validation over HTTP', () => {
  let app: ReturnType<typeof createApp>
  const port = BASE_PORT

  beforeAll(async () => {
    app = createApp()

    app.post('/users', validate({
      body: {
        name:  { type: 'string', required: true, max: 50 },
        email: { type: 'string', required: true, pattern: /^[^@]+@[^@]+$/ },
        age:   { type: 'number', min: 0, max: 150 },
      },
    }), (ctx: KairoContext) => {
      ctx.json({ created: true })
    })

    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('passes a fully valid body to the handler', async () => {
    const res = await req(port, 'POST', '/users', {
      body: { name: 'Alice', email: 'alice@example.com', age: 30 },
    })
    expect(res.status).toBe(200)
    expect((res.body as { created: boolean }).created).toBe(true)
  })

  it('returns 422 when a required field is missing', async () => {
    const res = await req(port, 'POST', '/users', {
      body: { name: 'Alice' }, // email missing
    })
    expect(res.status).toBe(422)
  })

  it('422 body contains field-level errors', async () => {
    const res = await req(port, 'POST', '/users', {
      body: { name: 'Alice' },
    })
    const body = res.body as { error: string; errors: { field: string }[] }
    expect(body.error).toBe('Validation failed')
    expect(body.errors.some((e) => e.field === 'body.email')).toBe(true)
  })

  it('returns 422 with all failing fields in one shot', async () => {
    const res = await req(port, 'POST', '/users', { body: {} })
    const body = res.body as { errors: unknown[] }
    expect(res.status).toBe(422)
    expect(body.errors.length).toBeGreaterThanOrEqual(2)
  })

  it('returns 422 when a number exceeds max', async () => {
    const res = await req(port, 'POST', '/users', {
      body: { name: 'Bob', email: 'bob@example.com', age: 999 },
    })
    expect(res.status).toBe(422)
  })

  it('returns 422 when string exceeds max length', async () => {
    const res = await req(port, 'POST', '/users', {
      body: { name: 'A'.repeat(51), email: 'a@b.com' },
    })
    expect(res.status).toBe(422)
  })
})

// ─── Query validation ─────────────────────────────────────────────────────────

describe('DX — query validation over HTTP', () => {
  let app: ReturnType<typeof createApp>
  const port = BASE_PORT + 1

  beforeAll(async () => {
    app = createApp()

    app.get('/search', validate({
      query: {
        q:    { type: 'string', required: true, min: 1, max: 200 },
        page: { type: 'number', min: 1 },
      },
    }), (ctx: KairoContext) => {
      ctx.json({ q: ctx.query['q'], page: ctx.query['page'] })
    })

    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('passes valid query params to the handler', async () => {
    const res = await req(port, 'GET', '/search?q=kairo&page=2')
    expect(res.status).toBe(200)
  })

  it('returns 422 when required query param is missing', async () => {
    const res = await req(port, 'GET', '/search')
    expect(res.status).toBe(422)
  })

  it('returns 422 when page is not a number', async () => {
    const res = await req(port, 'GET', '/search?q=test&page=abc')
    expect(res.status).toBe(422)
  })

  it('returns 422 when page is below min', async () => {
    const res = await req(port, 'GET', '/search?q=test&page=0')
    expect(res.status).toBe(422)
  })
})

// ─── devLogger does not break request flow ────────────────────────────────────

describe('DX — devLogger over HTTP', () => {
  let app: ReturnType<typeof createApp>
  const port = BASE_PORT + 2
  const captured: string[] = []

  beforeAll(async () => {
    app = createApp()
    app.use(devLogger({ enabled: true, write: l => captured.push(l) }))

    app.get('/hello', (ctx: KairoContext) => { ctx.json({ ok: true }) })

    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('does not block or alter the response', async () => {
    const res = await req(port, 'GET', '/hello')
    expect(res.status).toBe(200)
    expect((res.body as { ok: boolean }).ok).toBe(true)
  })

  it('writes log output for each request', async () => {
    captured.length = 0
    await req(port, 'GET', '/hello')
    expect(captured.length).toBeGreaterThan(0)
    expect(captured[0]).toContain('/hello')
  })
})
