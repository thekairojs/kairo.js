/**
 * Membrane integration tests — verifies the full middleware flow
 * against a real KairoApp instance over HTTP.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from 'kairo'
import { createMembrane, IpTracker, verifySignature, sign } from '../index.js'
import type { KairoContext } from 'kairo'

const BASE_PORT = 3400

async function req(
  port: number,
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: string; contentType?: string } = {},
): Promise<{ status: number; body: unknown; headers: Record<string, string> }> {
  const url = `http://127.0.0.1:${port}${path}`
  const init: RequestInit = {
    method,
    headers: { ...options.headers },
  }
  if (options.body) {
    init.body = options.body
    ;(init.headers as Record<string, string>)['content-type'] = options.contentType ?? 'application/json'
  }
  const res = await fetch(url, init)
  const text = await res.text()
  let body: unknown = text
  try { body = JSON.parse(text) } catch { /* plain text */ }
  const headers: Record<string, string> = {}
  res.headers.forEach((v, k) => { headers[k] = v })
  return { status: res.status, body, headers }
}

describe('Membrane — entropy written to ctx.kairo.entropy', () => {
  let app: ReturnType<typeof createApp>
  const port = BASE_PORT

  beforeAll(async () => {
    const tracker = new IpTracker()
    app = createApp()
    app.use(createMembrane({ ipTracker: tracker, trustProxy: false }))

    app.get('/score', (ctx: KairoContext) => {
      ctx.json({ entropy: ctx.kairo.entropy })
    })

    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('entropy is a finite number in [0, 1] on a normal request', async () => {
    const res = await req(port, 'GET', '/score', {
      headers: {
        'user-agent': 'Mozilla/5.0',
        'accept': 'application/json',
        'accept-language': 'en-US',
        'host': `127.0.0.1:${port}`,
      },
    })
    expect(res.status).toBe(200)
    const body = res.body as { entropy: number }
    expect(typeof body.entropy).toBe('number')
    expect(body.entropy).toBeGreaterThanOrEqual(0)
    expect(body.entropy).toBeLessThanOrEqual(1)
  })

  it('entropy is higher for a suspicious request (sqlmap UA)', async () => {
    // Use an explicit sqlmap user-agent — our fingerprinter flags it with +0.40.
    // Node.js fetch (undici) injects its own user-agent, so we override explicitly
    // to ensure a deterministic signal rather than relying on absent headers.
    const normalRes = await req(port, 'GET', '/score', {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; normal browser)',
        'accept': 'application/json',
        'accept-language': 'en-US',
        'host': `127.0.0.1:${port}`,
      },
    })
    const suspiciousRes = await req(port, 'GET', '/score', {
      headers: {
        'user-agent': 'sqlmap/1.7.8#stable',
        'accept': 'application/json',
        'host': `127.0.0.1:${port}`,
      },
    })
    const normal = (normalRes.body as { entropy: number }).entropy
    const suspicious = (suspiciousRes.body as { entropy: number }).entropy
    expect(suspicious).toBeGreaterThan(normal)
  })
})

describe('Membrane — taint propagation in request context', () => {
  let app: ReturnType<typeof createApp>
  const port = BASE_PORT + 1

  beforeAll(async () => {
    const tracker = new IpTracker()
    app = createApp()
    app.use(createMembrane({ ipTracker: tracker }))

    app.get('/taint', (ctx: KairoContext) => {
      ctx.json({
        tainted: Array.from(ctx.kairo.taintedPaths),
      })
    })

    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('marks query parameters as tainted', async () => {
    const res = await req(port, 'GET', '/taint?name=alice&role=user')
    const body = res.body as { tainted: string[] }
    expect(body.tainted).toContain('query.name')
    expect(body.tainted).toContain('query.role')
  })
})

describe('Membrane — hardeningActive flag on high entropy', () => {
  let app: ReturnType<typeof createApp>
  const port = BASE_PORT + 2
  let capturedHardening = false

  beforeAll(async () => {
    const tracker = new IpTracker()
    app = createApp()
    app.use(createMembrane({
      ipTracker: tracker,
      entropyEventThreshold: 0.01, // very low threshold to reliably trigger
    }))

    app.get('/hardening', (ctx: KairoContext) => {
      capturedHardening = ctx.kairo.hardeningActive
      ctx.json({ hardening: ctx.kairo.hardeningActive })
    })

    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('sets hardeningActive when entropy exceeds threshold', async () => {
    // Use sqlmap UA — fingerprinter adds +0.40 → composite >> 0.01 threshold.
    // We set user-agent explicitly since Node.js fetch (undici) may inject its own.
    await req(port, 'GET', '/hardening', {
      headers: {
        'user-agent': 'sqlmap/1.7.8#stable',
        'host': `127.0.0.1:${port}`,
      },
    })
    expect(capturedHardening).toBe(true)
  })
})

describe('Membrane — security event emitted on entropy spike', () => {
  let app: ReturnType<typeof createApp>
  const port = BASE_PORT + 3

  beforeAll(async () => {
    const tracker = new IpTracker()
    app = createApp()
    app.use(createMembrane({
      ipTracker: tracker,
      entropyEventThreshold: 0.01,
    }))

    app.get('/events', (ctx: KairoContext) => {
      ctx.json({ count: ctx.kairo.events.length })
    })

    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('emits entropy_spike event when threshold exceeded', async () => {
    const res = await req(port, 'GET', '/events', {
      // sqlmap UA → high entropy → trips the 0.01 threshold → emits entropy_spike event
      headers: {
        'user-agent': 'sqlmap/1.7.8#stable',
        'host': `127.0.0.1:${port}`,
      },
    })
    const body = res.body as { count: number }
    // At least one security event should have been emitted
    expect(body.count).toBeGreaterThan(0)
  })
})

describe('Membrane — exposeDetail state', () => {
  let app: ReturnType<typeof createApp>
  const port = BASE_PORT + 4

  beforeAll(async () => {
    const tracker = new IpTracker()
    app = createApp()
    app.use(createMembrane({ ipTracker: tracker, exposeDetail: true }))

    app.get('/detail', (ctx: KairoContext) => {
      const detail = ctx.state['kairo.entropy.detail'] as {
        score: number
        components: Record<string, number>
        signals: string[]
      } | undefined
      ctx.json({
        hasDetail: !!detail,
        hasComponents: !!(detail?.components),
        hasSignals: Array.isArray(detail?.signals),
      })
    })

    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('attaches detailed entropy breakdown to ctx.state when exposeDetail is true', async () => {
    const res = await req(port, 'GET', '/detail')
    const body = res.body as { hasDetail: boolean; hasComponents: boolean; hasSignals: boolean }
    expect(body.hasDetail).toBe(true)
    expect(body.hasComponents).toBe(true)
    expect(body.hasSignals).toBe(true)
  })
})

// ── verifySignature middleware ─────────────────────────────────────────────────

const HMAC_SECRET = 'test-secret-key-at-least-32-chars!'

// verifySignature works on ctx.body. The Kairo body parser returns a raw string
// for text/plain content-type — making that the reliable content-type for HMAC
// verification. For JSON bodies the parser produces a JS object, not the raw bytes,
// so re-serialization may not match the original signature (whitespace differences).
// Service-to-service callers should use text/plain or a dedicated binary envelope.

describe('verifySignature — required: false (default)', () => {
  let app: ReturnType<typeof createApp>
  const port = BASE_PORT + 5

  beforeAll(async () => {
    app = createApp()
    app.use(verifySignature({ secret: HMAC_SECRET, required: false }))
    app.post('/signed', (ctx: KairoContext) => {
      ctx.json({ ok: true, entropy: ctx.kairo.entropy })
    })
    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('passes through when no signature header is present', async () => {
    // No signature → not required → still 200
    const res = await req(port, 'POST', '/signed', {
      body: 'hello service',
      contentType: 'text/plain',
    })
    expect(res.status).toBe(200)
    expect((res.body as { ok: boolean }).ok).toBe(true)
  })

  it('passes through when signature is valid (text/plain body)', async () => {
    // Use text/plain so parseBody returns the raw string — HMAC can match exactly
    const bodyStr = 'service-to-service payload'
    const sig = sign(bodyStr, HMAC_SECRET)
    const res = await req(port, 'POST', '/signed', {
      body: bodyStr,
      contentType: 'text/plain',
      headers: { 'x-kairo-signature': sig },
    })
    expect(res.status).toBe(200)
  })

  it('elevates entropy on invalid signature but does NOT block', async () => {
    const res = await req(port, 'POST', '/signed', {
      body: 'service payload',
      contentType: 'text/plain',
      headers: { 'x-kairo-signature': 'sha256=deadbeef' },
    })
    // Still returns 200 — not blocked since required: false
    expect(res.status).toBe(200)
    // Entropy should be elevated due to invalid signature
    const body = res.body as { ok: boolean; entropy: number }
    expect(body.entropy).toBeGreaterThan(0)
  })
})

describe('verifySignature — required: true', () => {
  let app: ReturnType<typeof createApp>
  const port = BASE_PORT + 6

  beforeAll(async () => {
    app = createApp()
    app.use(verifySignature({ secret: HMAC_SECRET, required: true }))
    app.post('/protected', (ctx: KairoContext) => {
      ctx.json({ ok: true })
    })
    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('rejects requests with missing signature (401)', async () => {
    const res = await req(port, 'POST', '/protected', {
      body: 'payload',
      contentType: 'text/plain',
    })
    expect(res.status).toBe(401)
    expect((res.body as { error: string }).error).toContain('Missing signature')
  })

  it('rejects requests with invalid signature (401)', async () => {
    const res = await req(port, 'POST', '/protected', {
      body: 'payload',
      contentType: 'text/plain',
      headers: { 'x-kairo-signature': 'sha256=badhash' },
    })
    expect(res.status).toBe(401)
    expect((res.body as { error: string }).error).toContain('Invalid signature')
  })

  it('allows requests with valid HMAC signature (200)', async () => {
    const bodyStr = 'authenticated service payload'
    const sig = sign(bodyStr, HMAC_SECRET)
    const res = await req(port, 'POST', '/protected', {
      body: bodyStr,
      contentType: 'text/plain',
      headers: { 'x-kairo-signature': sig },
    })
    expect(res.status).toBe(200)
    expect((res.body as { ok: boolean }).ok).toBe(true)
  })
})
