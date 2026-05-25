import { describe, it, expect, vi } from 'vitest'
import { devLogger } from '../dev-logger.js'
import { createContext, createRequest, createResponse } from 'kairo'
import type { KairoContext } from 'kairo'
import type { IncomingMessage, ServerResponse } from 'node:http'

function makeCtx(method = 'GET', url = '/'): KairoContext {
  const raw = Object.assign(Object.create(null), {
    method, url,
    headers: {}, socket: { remoteAddress: '127.0.0.1' },
  }) as unknown as IncomingMessage
  const rawRes = Object.assign(Object.create(null), {
    headersSent: false, setHeader() {}, writeHead() {}, end() {},
  }) as unknown as ServerResponse
  return createContext(createRequest(raw), createResponse(rawRes), {})
}

function noop(): Promise<void> { return Promise.resolve() }

describe('devLogger — output lines', () => {
  it('logs method, path, status code and timing on the first line', async () => {
    const lines: string[] = []
    const ctx = makeCtx('GET', '/api/users')
    ctx.res.statusCode = 200

    await devLogger({ enabled: true, write: l => lines.push(l) })(ctx, noop)

    expect(lines[0]).toContain('GET')
    expect(lines[0]).toContain('/api/users')
    expect(lines[0]).toContain('200')
    expect(lines[0]).toMatch(/\d+ms/)
  })

  it('logs the entropy score', async () => {
    const lines: string[] = []
    const ctx = makeCtx()
    ctx.kairo.entropy = 0.42

    await devLogger({ enabled: true, write: l => lines.push(l) })(ctx, noop)

    const entropyLine = lines.find(l => l.includes('entropy'))
    expect(entropyLine).toBeDefined()
    expect(entropyLine).toContain('0.420')
  })

  it('logs "events: none" when no security events fired', async () => {
    const lines: string[] = []
    await devLogger({ enabled: true, write: l => lines.push(l) })(makeCtx(), noop)
    expect(lines.some(l => l.includes('events') && l.includes('none'))).toBe(true)
  })

  it('lists event types when security events are present', async () => {
    const lines: string[] = []
    const ctx = makeCtx()
    ctx.kairo.events.push({ type: 'entropy_spike', route: '/', detail: '', timestamp: Date.now(), entropy: 0.8, ip: '127.0.0.1' })

    await devLogger({ enabled: true, write: l => lines.push(l) })(ctx, noop)

    const eventLine = lines.find(l => l.includes('events'))
    expect(eventLine).toContain('entropy_spike')
  })

  it('lists tainted paths', async () => {
    const lines: string[] = []
    const ctx = makeCtx()
    ctx.kairo.taintedPaths.add('query.search')
    ctx.kairo.taintedPaths.add('body.email')

    await devLogger({ enabled: true, write: l => lines.push(l) })(ctx, noop)

    const taintedLine = lines.find(l => l.includes('tainted'))
    expect(taintedLine).toContain('query.search')
    expect(taintedLine).toContain('body.email')
  })

  it('shows "none" for tainted when no paths are tainted', async () => {
    const lines: string[] = []
    await devLogger({ enabled: true, write: l => lines.push(l) })(makeCtx(), noop)
    expect(lines.some(l => l.includes('tainted') && l.includes('none'))).toBe(true)
  })

  it('shows resolved lattice claims when available', async () => {
    const lines: string[] = []
    const ctx = makeCtx()
    ctx.kairo.lattice = { claims: { level: 'high', roles: ['admin'], subject: 'u-99' }, resolved: true }

    await devLogger({ enabled: true, write: l => lines.push(l) })(ctx, noop)

    const latticeLine = lines.find(l => l.includes('lattice'))
    expect(latticeLine).toContain('high')
    expect(latticeLine).toContain('u-99')
    expect(latticeLine).toContain('admin')
  })

  it('shows "unresolved" when lattice has not been run', async () => {
    const lines: string[] = []
    await devLogger({ enabled: true, write: l => lines.push(l) })(makeCtx(), noop)
    expect(lines.some(l => l.includes('lattice') && l.includes('unresolved'))).toBe(true)
  })

  it('includes component breakdown when entropy detail is in ctx.state', async () => {
    const lines: string[] = []
    const ctx = makeCtx()
    ctx.state['kairo.entropy.detail'] = {
      components: { header: 0.4, ipBehavior: 0.0, payload: 0.0, timing: 0.0 },
      signals: ['scanner user-agent detected'],
    }

    await devLogger({ enabled: true, write: l => lines.push(l) })(ctx, noop)

    const entropyLine = lines.find(l => l.includes('header'))
    expect(entropyLine).toContain('header: 0.40')
    expect(entropyLine).toContain('ip: 0.00')
  })

  it('logs signals line when signals are present', async () => {
    const lines: string[] = []
    const ctx = makeCtx()
    ctx.state['kairo.entropy.detail'] = {
      components: { header: 0.4, ipBehavior: 0.0, payload: 0.0, timing: 0.0 },
      signals: ['scanner user-agent detected'],
    }

    await devLogger({ enabled: true, write: l => lines.push(l) })(ctx, noop)

    expect(lines.some(l => l.includes('signals') && l.includes('scanner'))).toBe(true)
  })
})

describe('devLogger — enabled flag', () => {
  it('is a no-op when enabled is false', async () => {
    const write = vi.fn()
    const ctx = makeCtx()
    await devLogger({ enabled: false, write })(ctx, noop)
    expect(write).not.toHaveBeenCalled()
  })

  it('calls next() even when disabled', async () => {
    const next = vi.fn().mockResolvedValue(undefined)
    const ctx = makeCtx()
    await devLogger({ enabled: false })(ctx, next)
    expect(next).toHaveBeenCalled()
  })

  it('still calls next() when enabled', async () => {
    const next = vi.fn().mockResolvedValue(undefined)
    const ctx = makeCtx()
    await devLogger({ enabled: true, write: () => {} })(ctx, next)
    expect(next).toHaveBeenCalled()
  })
})
