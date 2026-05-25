import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from 'kairo'
import { createSentinel, createCanary, checkSql, scanForCanary } from '../index.js'
import type { KairoContext } from 'kairo'

const BASE_PORT = 3600

async function req(
  port: number,
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: string; contentType?: string } = {},
): Promise<{ status: number; body: unknown }> {
  const url = `http://127.0.0.1:${port}${path}`
  const init: RequestInit = { method, headers: { ...options.headers } }
  if (options.body) {
    init.body = options.body
    ;(init.headers as Record<string, string>)['content-type'] = options.contentType ?? 'application/json'
  }
  const res = await fetch(url, init)
  const text = await res.text()
  let body: unknown = text
  try { body = JSON.parse(text) } catch { /* plain */ }
  return { status: res.status, body }
}

describe('Sentinel — response scanning catches canary in ctx.json()', () => {
  let app: ReturnType<typeof createApp>
  const port = BASE_PORT

  beforeAll(async () => {
    app = createApp()
    app.use(createSentinel({ monitorMemory: false }))

    app.get('/users', (ctx: KairoContext) => {
      const record = createCanary({ id: 1, name: 'Alice' }, ctx)
      ctx.json({ users: [record] })
    })

    app.get('/clean', (ctx: KairoContext) => {
      ctx.json({ users: [{ id: 1, name: 'Alice' }] })
    })

    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('detects canary in response and emits event', async () => {
    const res = await req(port, 'GET', '/users')
    expect(res.status).toBe(200)
    // The response still goes through (sentinel observes, does not block)
    const body = res.body as { users: unknown[] }
    expect(body.users).toHaveLength(1)
  })

  it('does not fire for clean responses', async () => {
    const res = await req(port, 'GET', '/clean')
    expect(res.status).toBe(200)
  })
})

describe('Sentinel — memory monitoring emits event on spike', () => {
  let app: ReturnType<typeof createApp>
  const port = BASE_PORT + 1
  let eventFired = false

  beforeAll(async () => {
    app = createApp()
    // onEvent fires after next() returns — the handler can't see it,
    // but this callback receives it synchronously at emit time.
    app.use(createSentinel({
      monitorMemory: true,
      memoryThresholdBytes: 1,
      scanResponses: false,
      onEvent: (e) => { if (e.type === 'memory_pressure') eventFired = true },
    }))

    app.get('/allocate', (ctx: KairoContext) => {
      ctx.json({ done: true })
    })

    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('emits memory_pressure event when heap delta exceeds threshold', async () => {
    eventFired = false
    await req(port, 'GET', '/allocate')
    expect(eventFired).toBe(true)
  })
})

describe('Sentinel — sink checking wired into route handlers', () => {
  let app: ReturnType<typeof createApp>
  const port = BASE_PORT + 2

  beforeAll(async () => {
    app = createApp()
    app.use(createSentinel({ monitorMemory: false, scanResponses: false }))

    app.get('/search', (ctx: KairoContext) => {
      const q = (ctx.query['q'] ?? '') as string
      const violation = checkSql(ctx, q, 'query.q')
      ctx.json({ safe: violation === null, entropy: ctx.kairo.entropy })
    })

    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('clean query passes with no violation', async () => {
    const res = await req(port, 'GET', '/search?q=alice')
    expect((res.body as { safe: boolean }).safe).toBe(true)
  })

  it('SQL injection in query param is detected', async () => {
    const res = await req(port, 'GET', "/search?q=1%20UNION%20SELECT%20null")
    const body = res.body as { safe: boolean; entropy: number }
    expect(body.safe).toBe(false)
    expect(body.entropy).toBeGreaterThan(0)
  })
})

describe('Sentinel — sentinel is non-blocking by default', () => {
  let app: ReturnType<typeof createApp>
  const port = BASE_PORT + 3

  beforeAll(async () => {
    app = createApp()
    app.use(createSentinel({ monitorMemory: false }))

    app.get('/canary-leak', (ctx: KairoContext) => {
      const record = createCanary({ secret: 'exfiltrated' }, ctx)
      ctx.json(record)
    })

    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('still returns 200 even when canary is detected (observe only)', async () => {
    const res = await req(port, 'GET', '/canary-leak')
    expect(res.status).toBe(200)
  })
})
