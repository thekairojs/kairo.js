import { describe, it, expect } from 'vitest'
import { propagateTaint, isTainted, isAncestorTainted } from '../taint.js'
import { createContext, createRequest, createResponse } from 'kairo'
import type { IncomingMessage, ServerResponse } from 'node:http'

function makeCtx(options: {
  url?: string
  params?: Record<string, string>
  body?: unknown
} = {}) {
  const raw = Object.assign(Object.create(null), {
    method: 'POST',
    url: options.url ?? '/',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  }) as unknown as IncomingMessage

  const rawRes = Object.assign(Object.create(null), {
    headersSent: false,
    setHeader() {},
    writeHead() {},
    end() {},
  }) as unknown as ServerResponse

  const req = createRequest(raw)
  const res = createResponse(rawRes)
  const ctx = createContext(req, res, options.params ?? {})
  ctx.body = options.body
  return ctx
}

describe('propagateTaint — query parameters', () => {
  it('marks each query key as tainted', () => {
    const ctx = makeCtx({ url: '/search?q=hello&limit=10' })
    propagateTaint(ctx)
    expect(isTainted(ctx, 'query.q')).toBe(true)
    expect(isTainted(ctx, 'query.limit')).toBe(true)
  })

  it('does not mark non-existent query keys', () => {
    const ctx = makeCtx({ url: '/search?q=hello' })
    propagateTaint(ctx)
    expect(isTainted(ctx, 'query.missing')).toBe(false)
  })
})

describe('propagateTaint — path parameters', () => {
  it('marks path params as tainted', () => {
    const ctx = makeCtx({ params: { userId: '42', action: 'edit' } })
    propagateTaint(ctx)
    expect(isTainted(ctx, 'params.userId')).toBe(true)
    expect(isTainted(ctx, 'params.action')).toBe(true)
  })

  it('does not mark params that were not set', () => {
    const ctx = makeCtx({ params: {} })
    propagateTaint(ctx)
    expect(isTainted(ctx, 'params.id')).toBe(false)
  })
})

describe('propagateTaint — request body', () => {
  it('marks flat object keys as tainted', () => {
    const ctx = makeCtx({ body: { email: 'user@example.com', password: 'secret' } })
    propagateTaint(ctx)
    expect(isTainted(ctx, 'body.email')).toBe(true)
    expect(isTainted(ctx, 'body.password')).toBe(true)
  })

  it('marks nested object keys as tainted', () => {
    const ctx = makeCtx({ body: { user: { name: 'Alice', address: { city: 'NYC' } } } })
    propagateTaint(ctx)
    expect(isTainted(ctx, 'body.user')).toBe(true)
    expect(isTainted(ctx, 'body.user.name')).toBe(true)
    expect(isTainted(ctx, 'body.user.address')).toBe(true)
    expect(isTainted(ctx, 'body.user.address.city')).toBe(true)
  })

  it('marks array elements as tainted', () => {
    const ctx = makeCtx({ body: { ids: [1, 2, 3] } })
    propagateTaint(ctx)
    expect(isTainted(ctx, 'body.ids')).toBe(true)
    expect(isTainted(ctx, 'body.ids[0]')).toBe(true)
    expect(isTainted(ctx, 'body.ids[2]')).toBe(true)
  })

  it('does not taint body keys for null body', () => {
    const ctx = makeCtx({ body: null })
    propagateTaint(ctx)
    expect(isTainted(ctx, 'body.key')).toBe(false)
  })

  it('does not taint for undefined body', () => {
    const ctx = makeCtx({ body: undefined })
    propagateTaint(ctx)
    expect(isTainted(ctx, 'body.key')).toBe(false)
  })

  it('handles string body (raw JSON string)', () => {
    const ctx = makeCtx({ body: 'raw string body' })
    propagateTaint(ctx)
    // A string body is a leaf — body itself is tainted
    expect(isTainted(ctx, 'body')).toBe(true)
  })
})

describe('isTainted()', () => {
  it('returns false for unknown path', () => {
    const ctx = makeCtx()
    propagateTaint(ctx)
    expect(isTainted(ctx, 'query.nonexistent')).toBe(false)
  })
})

describe('isAncestorTainted()', () => {
  it('returns true when a parent path is tainted', () => {
    const ctx = makeCtx({ body: { user: { name: 'Alice' } } })
    propagateTaint(ctx)

    // body.user is tainted — so body.user.name is covered by ancestor check
    expect(isAncestorTainted(ctx, 'body.user.name.length')).toBe(true)
  })

  it('returns false when no ancestor is tainted', () => {
    const ctx = makeCtx({ body: { email: 'x@x.com' } })
    propagateTaint(ctx)
    expect(isAncestorTainted(ctx, 'unknown.deep.path')).toBe(false)
  })

  it('returns true when exact path matches (not just ancestors)', () => {
    const ctx = makeCtx({ body: { email: 'x@x.com' } })
    propagateTaint(ctx)
    expect(isAncestorTainted(ctx, 'body.email')).toBe(true)
  })
})

describe('propagateTaint — Buffer body', () => {
  it('treats Buffer as a tainted leaf (does not enumerate byte indices)', () => {
    const ctx = makeCtx({ body: Buffer.from('binary data') })
    propagateTaint(ctx)
    // The body itself should be tainted
    expect(isTainted(ctx, 'body')).toBe(true)
    // No numeric indices like 'body.0', 'body.1' should appear
    const numericKeys = Array.from(ctx.kairo.taintedPaths).filter(p => /body\.\d+/.test(p))
    expect(numericKeys).toHaveLength(0)
  })
})

describe('propagateTaint — depth cap', () => {
  it('does not infinitely recurse on deeply nested structures', () => {
    // Build an 15-level deep object — exceeds MAX_TAINT_DEPTH of 8
    let deep: unknown = { leaf: 'value' }
    for (let i = 0; i < 15; i++) {
      deep = { nested: deep }
    }

    const ctx = makeCtx({ body: deep })
    expect(() => propagateTaint(ctx)).not.toThrow()
    // Should still taint the top-level keys
    expect(isTainted(ctx, 'body.nested')).toBe(true)
  })
})
