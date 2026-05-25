import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from '@thekairojs/kairo'
import { createHardening } from '../hardening.js'
import type { KairoContext } from '@thekairojs/kairo'

const PORT = 4100

async function req(
  path: string,
  entropy: number,
): Promise<{ status: number; body: unknown }> {
  const url = `http://127.0.0.1:${PORT}${path}`
  const res = await fetch(url, {
    headers: { 'x-kairo-test-entropy': String(entropy) },
  })
  let body: unknown
  try { body = await res.json() } catch { body = null }
  return { status: res.status, body }
}

describe('createHardening — integration over HTTP', () => {
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    app = createApp()

    // Middleware that sets entropy from a test header (simulates membrane output)
    app.use(async (ctx: KairoContext, next) => {
      const h = ctx.headers['x-kairo-test-entropy']
      if (typeof h === 'string') {
        const n = parseFloat(h)
        if (Number.isFinite(n)) ctx.kairo.entropy = n
      }
      await next()
    })

    app.use(createHardening({ threshold: 0.75 }))

    app.get('/data', (ctx: KairoContext) => {
      ctx.json({ secret: 'data' })
    })

    await app.listen(PORT)
  })

  afterAll(async () => { await app.close() })

  it('passes a low-entropy request through to the handler', async () => {
    const { status, body } = await req('/data', 0.3)
    expect(status).toBe(200)
    expect((body as { secret: string }).secret).toBe('data')
  })

  it('blocks a high-entropy request with 429', async () => {
    const { status } = await req('/data', 0.9)
    expect(status).toBe(429)
  })

  it('returns an error body on block', async () => {
    const { body } = await req('/data', 0.9)
    expect((body as { error: string }).error).toBeTruthy()
  })

  it('passes a request right at 0.74 (below default threshold)', async () => {
    const { status } = await req('/data', 0.74)
    expect(status).toBe(200)
  })

  it('blocks a request at exactly the threshold (0.75)', async () => {
    const { status } = await req('/data', 0.75)
    expect(status).toBe(429)
  })
})
