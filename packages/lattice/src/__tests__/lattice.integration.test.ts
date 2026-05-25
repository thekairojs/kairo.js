import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from 'kairo'
import { createLattice } from '../index.js'
import type { KairoContext } from 'kairo'

const BASE_PORT = 3800

async function req(
  port: number,
  method: string,
  path: string,
  options: { headers?: Record<string, string> } = {},
): Promise<{ status: number; body: unknown }> {
  const url = `http://127.0.0.1:${port}${path}`
  const res = await fetch(url, { method, headers: { ...options.headers } })
  const text = await res.text()
  let body: unknown = text
  try { body = JSON.parse(text) } catch { /* plain */ }
  return { status: res.status, body }
}

// ─── Level-based protection ───────────────────────────────────────────────────

describe('Lattice — level-based route protection', () => {
  let app: ReturnType<typeof createApp>
  const port = BASE_PORT

  beforeAll(async () => {
    app = createApp()

    // Resolver: trust level comes from x-trust header (stand-in for real auth)
    const lattice = createLattice({
      resolve: (ctx: KairoContext) => {
        const level = ctx.headers['x-trust'] as string | undefined
        if (level === 'high')   return { level: 'high',   roles: ['admin'] }
        if (level === 'medium') return { level: 'medium', roles: ['user'] }
        if (level === 'low')    return { level: 'low',    roles: ['user'] }
        return { level: 'none', roles: [] }
      },
    })

    app.use(lattice)

    app.get('/public', (ctx: KairoContext) => { ctx.json({ ok: true }) })
    app.get('/members', lattice.require({ level: 'low' }), (ctx: KairoContext) => { ctx.json({ ok: true }) })
    app.get('/admin', lattice.require({ level: 'high' }), (ctx: KairoContext) => { ctx.json({ ok: true }) })

    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('public route is accessible without any trust header', async () => {
    const res = await req(port, 'GET', '/public')
    expect(res.status).toBe(200)
  })

  it('members route allows low-trust request', async () => {
    const res = await req(port, 'GET', '/members', { headers: { 'x-trust': 'low' } })
    expect(res.status).toBe(200)
  })

  it('members route blocks anonymous request', async () => {
    const res = await req(port, 'GET', '/members')
    expect(res.status).toBe(403)
  })

  it('admin route allows high-trust request', async () => {
    const res = await req(port, 'GET', '/admin', { headers: { 'x-trust': 'high' } })
    expect(res.status).toBe(200)
  })

  it('admin route blocks medium-trust request', async () => {
    const res = await req(port, 'GET', '/admin', { headers: { 'x-trust': 'medium' } })
    expect(res.status).toBe(403)
  })

  it('admin route blocks low-trust request', async () => {
    const res = await req(port, 'GET', '/admin', { headers: { 'x-trust': 'low' } })
    expect(res.status).toBe(403)
  })

  it('403 response has correct shape and does not leak reason', async () => {
    const res = await req(port, 'GET', '/admin')
    const body = res.body as { error: string; reason?: string }
    expect(body.error).toBe('Forbidden')
    // reason must NOT be in the response body — it leaks auth requirements
    expect(body.reason).toBeUndefined()
  })
})

// ─── Role-based protection ────────────────────────────────────────────────────

describe('Lattice — role-based route protection', () => {
  let app: ReturnType<typeof createApp>
  const port = BASE_PORT + 1

  beforeAll(async () => {
    app = createApp()

    const lattice = createLattice({
      resolve: (ctx: KairoContext) => {
        const roles = ((ctx.headers['x-roles'] as string) ?? '').split(',').filter(Boolean)
        return { level: roles.length > 0 ? 'low' : 'none', roles }
      },
    })

    app.use(lattice)
    app.get('/billing', lattice.require({ level: 'low', roles: ['billing'] }), (ctx: KairoContext) => {
      ctx.json({ ok: true })
    })
    app.get('/super', lattice.require({ level: 'low', roles: ['admin', 'billing'], all: true }), (ctx: KairoContext) => {
      ctx.json({ ok: true })
    })

    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('allows when caller has the required role', async () => {
    const res = await req(port, 'GET', '/billing', { headers: { 'x-roles': 'billing' } })
    expect(res.status).toBe(200)
  })

  it('allows when caller has one of multiple roles', async () => {
    const res = await req(port, 'GET', '/billing', { headers: { 'x-roles': 'editor,billing' } })
    expect(res.status).toBe(200)
  })

  it('blocks when caller lacks the required role', async () => {
    const res = await req(port, 'GET', '/billing', { headers: { 'x-roles': 'editor' } })
    expect(res.status).toBe(403)
  })

  it('allows when caller has ALL required roles (all: true)', async () => {
    const res = await req(port, 'GET', '/super', { headers: { 'x-roles': 'admin,billing' } })
    expect(res.status).toBe(200)
  })

  it('blocks when caller has only one of two required roles (all: true)', async () => {
    const res = await req(port, 'GET', '/super', { headers: { 'x-roles': 'admin' } })
    expect(res.status).toBe(403)
  })
})

// ─── Group-level protection ───────────────────────────────────────────────────

describe('Lattice — group-level trust requirement', () => {
  let app: ReturnType<typeof createApp>
  const port = BASE_PORT + 2

  beforeAll(async () => {
    app = createApp()

    const lattice = createLattice({
      resolve: (ctx: KairoContext) => {
        const level = ctx.headers['x-trust'] as string | undefined
        if (level === 'high') return { level: 'high', roles: ['admin'] }
        return { level: 'none', roles: [] }
      },
    })

    app.use(lattice)

    const api = app.group('/api', { middleware: [lattice.require({ level: 'high' })] })
    api.get('/secret', (ctx: KairoContext) => { ctx.json({ data: 'classified' }) })
    api.get('/another', (ctx: KairoContext) => { ctx.json({ data: 'also classified' }) })

    app.get('/open', (ctx: KairoContext) => { ctx.json({ ok: true }) })

    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('group routes require high trust', async () => {
    const res = await req(port, 'GET', '/api/secret')
    expect(res.status).toBe(403)
  })

  it('group routes accessible with high trust', async () => {
    const res = await req(port, 'GET', '/api/secret', { headers: { 'x-trust': 'high' } })
    expect(res.status).toBe(200)
  })

  it('open route unaffected by group middleware', async () => {
    const res = await req(port, 'GET', '/open')
    expect(res.status).toBe(200)
  })
})

// ─── Custom onDeny + security events ─────────────────────────────────────────

describe('Lattice — custom onDeny and security events', () => {
  let app: ReturnType<typeof createApp>
  const port = BASE_PORT + 3
  let capturedEvents: string[] = []

  beforeAll(async () => {
    app = createApp()
    capturedEvents = []

    const lattice = createLattice({
      resolve: () => ({ level: 'none', roles: [] }),
      onDeny: (ctx: KairoContext, reason: string) => {
        capturedEvents.push(reason)
        ctx.json({ denied: true, msg: reason }, 403)
      },
    })

    app.use(lattice)
    app.get('/protected', lattice.require({ level: 'medium' }), (ctx: KairoContext) => {
      ctx.json({ ok: true })
    })

    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('custom onDeny is called with the denial reason', async () => {
    await req(port, 'GET', '/protected')
    expect(capturedEvents.length).toBeGreaterThan(0)
    expect(capturedEvents[0]).toContain('medium')
  })

  it('custom onDeny response is used', async () => {
    const res = await req(port, 'GET', '/protected')
    const body = res.body as { denied: boolean }
    expect(res.status).toBe(403)
    expect(body.denied).toBe(true)
  })
})

// ─── Claims accessible in handler ────────────────────────────────────────────

describe('Lattice — claims visible inside handler', () => {
  let app: ReturnType<typeof createApp>
  const port = BASE_PORT + 4

  beforeAll(async () => {
    app = createApp()

    const lattice = createLattice({
      resolve: () => ({ level: 'high', roles: ['admin'], subject: 'user-42' }),
    })

    app.use(lattice)
    app.get('/me', (ctx: KairoContext) => {
      ctx.json({
        level: ctx.kairo.lattice.claims?.level,
        roles: ctx.kairo.lattice.claims?.roles,
        subject: ctx.kairo.lattice.claims?.subject,
      })
    })

    await app.listen(port)
  })

  afterAll(async () => { await app.close() })

  it('handler can read resolved trust claims from ctx.kairo.lattice', async () => {
    const res = await req(port, 'GET', '/me')
    const body = res.body as { level: string; roles: string[]; subject: string }
    expect(res.status).toBe(200)
    expect(body.level).toBe('high')
    expect(body.roles).toContain('admin')
    expect(body.subject).toBe('user-42')
  })
})
