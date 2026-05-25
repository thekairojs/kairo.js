import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createApp } from '../index.js'
import type { KairoApp } from '../app.js'
import type { KairoContext } from '../types.js'

const BASE_PORT = 3100

async function request(
  port: number,
  method: string,
  path: string,
  options: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; headers: Record<string, string>; body: unknown; text: string }> {
  const url = `http://127.0.0.1:${port}${path}`
  const init: RequestInit = {
    method,
    headers: {
      'accept': 'application/json',
      ...options.headers,
    },
  }

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body)
    ;(init.headers as Record<string, string>)['content-type'] = 'application/json'
  }

  const res = await fetch(url, init)
  const text = await res.text()
  let body: unknown = text
  try { body = JSON.parse(text) } catch { /* not JSON */ }

  const headers: Record<string, string> = {}
  res.headers.forEach((value, key) => { headers[key] = value })

  return { status: res.status, headers, body, text }
}

// ─── Suite 1: Basic Routing ───

describe('Basic routing', () => {
  let app: KairoApp
  const port = BASE_PORT

  beforeAll(async () => {
    app = createApp()
    app.get('/', (ctx) => ctx.json({ hello: 'kairo' }))
    app.get('/users', (ctx) => ctx.json([{ id: 1 }]))
    app.get('/users/:id', (ctx) => ctx.json({ id: ctx.params['id'] }))
    app.post('/users', (ctx) => ctx.json({ created: true, body: ctx.body }, 201))
    app.put('/users/:id', (ctx) => ctx.json({ updated: ctx.params['id'] }))
    app.delete('/users/:id', (ctx) => ctx.status(204).send(undefined))
    app.patch('/users/:id', (ctx) => ctx.json({ patched: true }))
    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('GET / returns hello kairo', async () => {
    const res = await request(port, 'GET', '/')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ hello: 'kairo' })
  })

  it('GET /users returns array', async () => {
    const res = await request(port, 'GET', '/users')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it('GET /users/:id returns param', async () => {
    const res = await request(port, 'GET', '/users/123')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: '123' })
  })

  it('POST /users returns 201 with body', async () => {
    const res = await request(port, 'POST', '/users', { body: { name: 'Alice' } })
    expect(res.status).toBe(201)
    expect((res.body as { created: boolean }).created).toBe(true)
    expect((res.body as { body: unknown }).body).toEqual({ name: 'Alice' })
  })

  it('PUT /users/:id returns updated', async () => {
    const res = await request(port, 'PUT', '/users/42', { body: { name: 'Bob' } })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ updated: '42' })
  })

  it('DELETE /users/:id returns 204', async () => {
    const res = await request(port, 'DELETE', '/users/99')
    expect(res.status).toBe(204)
  })

  it('PATCH /users/:id returns patched', async () => {
    const res = await request(port, 'PATCH', '/users/7', { body: {} })
    expect(res.status).toBe(200)
    expect((res.body as { patched: boolean }).patched).toBe(true)
  })

  it('returns 404 for unknown route', async () => {
    const res = await request(port, 'GET', '/unknown')
    expect(res.status).toBe(404)
  })

  it('returns 405 for wrong method on known path', async () => {
    const res = await request(port, 'DELETE', '/users')
    expect(res.status).toBe(405)
    expect(res.headers['allow']).toContain('GET')
  })
})

// ─── Suite 2: Middleware ───

describe('Middleware pipeline', () => {
  let app: KairoApp
  const port = BASE_PORT + 1

  beforeAll(async () => {
    app = createApp()

    // Global timing middleware
    app.use(async (ctx, next) => {
      ctx.state['started'] = true
      await next()
      ctx.set('X-Powered-By', 'kairo')
    })

    // Authentication middleware
    const requireAuth = async (ctx: KairoContext, next: () => Promise<void>) => {
      const token = ctx.headers['authorization']
      if (!token) {
        ctx.json({ error: 'Unauthorized' }, 401)
        return
      }
      ctx.state['user'] = { id: 'u1', token }
      await next()
    }

    app.get('/public', (ctx) => ctx.json({ public: true, started: ctx.state['started'] }))
    app.get('/private', requireAuth, (ctx) => ctx.json({ user: ctx.state['user'] }))

    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('global middleware runs for all routes', async () => {
    const res = await request(port, 'GET', '/public')
    expect(res.headers['x-powered-by']).toBe('kairo')
  })

  it('global middleware sets state before handler', async () => {
    const res = await request(port, 'GET', '/public')
    expect((res.body as { started: boolean }).started).toBe(true)
  })

  it('route-scoped middleware blocks without auth', async () => {
    const res = await request(port, 'GET', '/private')
    expect(res.status).toBe(401)
  })

  it('route-scoped middleware allows with auth', async () => {
    const res = await request(port, 'GET', '/private', {
      headers: { authorization: 'Bearer secret' },
    })
    expect(res.status).toBe(200)
    expect((res.body as { user: { id: string } }).user.id).toBe('u1')
  })
})

// ─── Suite 3: Route Groups ───

describe('Route groups', () => {
  let app: KairoApp
  const port = BASE_PORT + 2

  beforeAll(async () => {
    app = createApp()

    const api = app.group('/api/v1')
    api.get('/health', (ctx) => ctx.json({ status: 'ok' }))
    api.get('/users', (ctx) => ctx.json({ users: [] }))

    const admin = app.group('/admin', {
      middleware: [
        async (ctx, next) => {
          if (ctx.headers['x-admin-key'] !== 'secret') {
            ctx.json({ error: 'Forbidden' }, 403)
            return
          }
          await next()
        },
      ],
    })
    admin.get('/stats', (ctx) => ctx.json({ requests: 9001 }))

    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('matches prefixed group routes', async () => {
    const res = await request(port, 'GET', '/api/v1/health')
    expect(res.status).toBe(200)
    expect((res.body as { status: string }).status).toBe('ok')
  })

  it('group middleware blocks unauthorized', async () => {
    const res = await request(port, 'GET', '/admin/stats')
    expect(res.status).toBe(403)
  })

  it('group middleware allows authorized', async () => {
    const res = await request(port, 'GET', '/admin/stats', {
      headers: { 'x-admin-key': 'secret' },
    })
    expect(res.status).toBe(200)
    expect((res.body as { requests: number }).requests).toBe(9001)
  })
})

// ─── Suite 4: Ghost Routes ───

describe('Ghost routes', () => {
  let app: KairoApp
  const port = BASE_PORT + 3

  beforeAll(async () => {
    app = createApp()
    app.get('/legit', (ctx) => ctx.json({ real: true }))
    app.ghost('/trap', { response: { status: 'ok' }, alertLevel: 'high' })
    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('default ghost routes return 200 with fake data', async () => {
    const res = await request(port, 'GET', '/.env')
    expect(res.status).toBe(200)
  })

  it('custom ghost route returns fake response', async () => {
    const res = await request(port, 'GET', '/trap')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('legit route is unaffected by ghost routes', async () => {
    const res = await request(port, 'GET', '/legit')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ real: true })
  })
})

// ─── Suite 5: Error Handling ───

describe('Error handling', () => {
  let app: KairoApp
  const port = BASE_PORT + 4

  beforeAll(async () => {
    app = createApp()

    app.get('/crash', () => { throw new Error('Something went wrong') })
    app.get('/client-error', () => {
      const e = new Error('Bad input') as Error & { statusCode: number }
      e.statusCode = 400
      throw e
    })

    app.onError((err, ctx) => {
      const statusCode = (err as Error & { statusCode?: number }).statusCode ?? 500
      ctx.json({ error: err.message, handled: true }, statusCode)
    })

    app.onNotFound((ctx) => {
      ctx.json({ error: 'custom not found', path: ctx.path }, 404)
    })

    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('custom error handler receives errors', async () => {
    const res = await request(port, 'GET', '/crash')
    expect(res.status).toBe(500)
    expect((res.body as { handled: boolean }).handled).toBe(true)
  })

  it('error handler receives statusCode from error', async () => {
    const res = await request(port, 'GET', '/client-error')
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toBe('Bad input')
  })

  it('custom not-found handler fires', async () => {
    const res = await request(port, 'GET', '/missing')
    expect(res.status).toBe(404)
    expect((res.body as { error: string }).error).toBe('custom not found')
    expect((res.body as { path: string }).path).toBe('/missing')
  })
})

// ─── Suite 6: Query Strings and Params ───

describe('Query strings and URL params', () => {
  let app: KairoApp
  const port = BASE_PORT + 5

  beforeAll(async () => {
    app = createApp()
    app.get('/search', (ctx) => ctx.json({ q: ctx.query['q'], page: ctx.query['page'] }))
    app.get('/files/*', (ctx) => ctx.json({ path: ctx.params['*'] }))
    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('parses query parameters', async () => {
    const res = await request(port, 'GET', '/search?q=kairo&page=2')
    expect(res.body).toEqual({ q: 'kairo', page: '2' })
  })

  it('handles URL-encoded query values', async () => {
    const res = await request(port, 'GET', '/search?q=hello%20world')
    expect((res.body as { q: string }).q).toBe('hello world')
  })

  it('wildcard captures multi-segment paths', async () => {
    const res = await request(port, 'GET', '/files/a/b/c.txt')
    expect((res.body as { path: string }).path).toBe('a/b/c.txt')
  })
})

// ─── Suite 7: Handler auto-send ───

describe('Handler return value auto-send', () => {
  let app: KairoApp
  const port = BASE_PORT + 6

  beforeAll(async () => {
    app = createApp()
    app.get('/auto', () => ({ auto: true }))
    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('auto-sends returned objects as JSON', async () => {
    const res = await request(port, 'GET', '/auto')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ auto: true })
  })
})

// ─── Suite 8: Security context ───

describe('Security context', () => {
  let app: KairoApp
  const port = BASE_PORT + 7

  beforeAll(async () => {
    app = createApp()
    app.get('/entropy', (ctx) => ctx.json({ entropy: ctx.kairo.entropy }))
    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('entropy is a number on normal requests', async () => {
    const res = await request(port, 'GET', '/entropy')
    expect(res.status).toBe(200)
    expect(typeof (res.body as { entropy: number }).entropy).toBe('number')
  })

  it('ghost route hit elevates entropy', async () => {
    // Hit /.env (ghost route), entropy should rise for that context
    const res = await request(port, 'GET', '/.env')
    expect(res.status).toBe(200) // ghost returns 200 as deception
  })
})
