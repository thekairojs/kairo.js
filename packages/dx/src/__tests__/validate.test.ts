import { describe, it, expect, vi } from 'vitest'
import { validate } from '../validate.js'
import { createContext, createRequest, createResponse } from 'kairo'
import type { KairoContext } from 'kairo'
import type { IncomingMessage, ServerResponse } from 'node:http'

function makeCtx(url = '/', params: Record<string, string> = {}): KairoContext {
  const raw = Object.assign(Object.create(null), {
    method: 'POST', url,
    headers: {}, socket: { remoteAddress: '127.0.0.1' },
  }) as unknown as IncomingMessage
  const rawRes = Object.assign(Object.create(null), {
    headersSent: false, setHeader() {}, writeHead() {}, end() {},
  }) as unknown as ServerResponse
  return createContext(createRequest(raw), createResponse(rawRes), params)
}

function noop(): Promise<void> { return Promise.resolve() }

// ─── String fields ────────────────────────────────────────────────────────────

describe('validate — string type', () => {
  it('passes when a required string is present', async () => {
    const ctx = makeCtx()
    ctx.body = { name: 'Alice' }
    const next = vi.fn().mockResolvedValue(undefined)
    await validate({ body: { name: { type: 'string', required: true } } })(ctx, next)
    expect(next).toHaveBeenCalled()
  })

  it('fails when a required string is missing', async () => {
    const ctx = makeCtx()
    ctx.body = {}
    const jsonSpy = vi.spyOn(ctx, 'json')
    await validate({ body: { name: { type: 'string', required: true } } })(ctx, noop)
    expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({ error: 'Validation failed' }), 422)
  })

  it('fails when value exceeds max length', async () => {
    const ctx = makeCtx()
    ctx.body = { name: 'a'.repeat(101) }
    const jsonSpy = vi.spyOn(ctx, 'json')
    await validate({ body: { name: { type: 'string', max: 100 } } })(ctx, noop)
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({ errors: expect.arrayContaining([expect.objectContaining({ field: 'body.name' })]) }),
      422,
    )
  })

  it('passes when value is within max length', async () => {
    const ctx = makeCtx()
    ctx.body = { name: 'Alice' }
    const next = vi.fn().mockResolvedValue(undefined)
    await validate({ body: { name: { type: 'string', max: 100 } } })(ctx, next)
    expect(next).toHaveBeenCalled()
  })

  it('fails when value is below min length', async () => {
    const ctx = makeCtx()
    ctx.body = { code: 'ab' }
    const jsonSpy = vi.spyOn(ctx, 'json')
    await validate({ body: { code: { type: 'string', min: 3 } } })(ctx, noop)
    expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({ error: 'Validation failed' }), 422)
  })

  it('fails when value does not match pattern', async () => {
    const ctx = makeCtx()
    ctx.body = { email: 'not-an-email' }
    const jsonSpy = vi.spyOn(ctx, 'json')
    await validate({ body: { email: { type: 'string', pattern: /^[^@]+@[^@]+$/ } } })(ctx, noop)
    expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({ error: 'Validation failed' }), 422)
  })

  it('passes when value matches pattern', async () => {
    const ctx = makeCtx()
    ctx.body = { email: 'user@example.com' }
    const next = vi.fn().mockResolvedValue(undefined)
    await validate({ body: { email: { type: 'string', pattern: /^[^@]+@[^@]+$/ } } })(ctx, next)
    expect(next).toHaveBeenCalled()
  })

  it('fails when value is not a string', async () => {
    const ctx = makeCtx()
    ctx.body = { name: 42 }
    const jsonSpy = vi.spyOn(ctx, 'json')
    await validate({ body: { name: { type: 'string' } } })(ctx, noop)
    expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({ error: 'Validation failed' }), 422)
  })
})

// ─── Number fields ────────────────────────────────────────────────────────────

describe('validate — number type', () => {
  it('passes a valid number', async () => {
    const ctx = makeCtx()
    ctx.body = { age: 25 }
    const next = vi.fn().mockResolvedValue(undefined)
    await validate({ body: { age: { type: 'number' } } })(ctx, next)
    expect(next).toHaveBeenCalled()
  })

  it('fails when value is a string (body)', async () => {
    const ctx = makeCtx()
    ctx.body = { age: '25' }
    const jsonSpy = vi.spyOn(ctx, 'json')
    await validate({ body: { age: { type: 'number' } } })(ctx, noop)
    expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({ error: 'Validation failed' }), 422)
  })

  it('fails when value is below min', async () => {
    const ctx = makeCtx()
    ctx.body = { age: -1 }
    const jsonSpy = vi.spyOn(ctx, 'json')
    await validate({ body: { age: { type: 'number', min: 0 } } })(ctx, noop)
    expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({ error: 'Validation failed' }), 422)
  })

  it('fails when value exceeds max', async () => {
    const ctx = makeCtx()
    ctx.body = { age: 200 }
    const jsonSpy = vi.spyOn(ctx, 'json')
    await validate({ body: { age: { type: 'number', max: 150 } } })(ctx, noop)
    expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({ error: 'Validation failed' }), 422)
  })
})

// ─── Boolean fields ───────────────────────────────────────────────────────────

describe('validate — boolean type', () => {
  it('passes true and false', async () => {
    const ctx = makeCtx()
    ctx.body = { active: true }
    const next = vi.fn().mockResolvedValue(undefined)
    await validate({ body: { active: { type: 'boolean' } } })(ctx, next)
    expect(next).toHaveBeenCalled()
  })

  it('fails when value is a string (body)', async () => {
    const ctx = makeCtx()
    ctx.body = { active: 'true' }
    const jsonSpy = vi.spyOn(ctx, 'json')
    await validate({ body: { active: { type: 'boolean' } } })(ctx, noop)
    expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({ error: 'Validation failed' }), 422)
  })
})

// ─── Enum ─────────────────────────────────────────────────────────────────────

describe('validate — enum', () => {
  it('passes when value is in enum', async () => {
    const ctx = makeCtx()
    ctx.body = { role: 'admin' }
    const next = vi.fn().mockResolvedValue(undefined)
    await validate({ body: { role: { type: 'string', enum: ['admin', 'user', 'guest'] } } })(ctx, next)
    expect(next).toHaveBeenCalled()
  })

  it('fails when value is not in enum', async () => {
    const ctx = makeCtx()
    ctx.body = { role: 'superuser' }
    const jsonSpy = vi.spyOn(ctx, 'json')
    await validate({ body: { role: { type: 'string', enum: ['admin', 'user'] } } })(ctx, noop)
    expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({ error: 'Validation failed' }), 422)
  })
})

// ─── Nested object ────────────────────────────────────────────────────────────

describe('validate — nested object', () => {
  it('validates nested properties and reports deep field paths', async () => {
    const ctx = makeCtx()
    ctx.body = { user: { name: 42 } }
    const jsonSpy = vi.spyOn(ctx, 'json')
    await validate({
      body: {
        user: {
          type: 'object',
          properties: { name: { type: 'string', required: true } },
        },
      },
    })(ctx, noop)
    const call = jsonSpy.mock.calls[0]
    const body = call?.[0] as { errors: { field: string }[] }
    expect(body.errors[0]?.field).toBe('body.user.name')
  })

  it('passes a valid nested object', async () => {
    const ctx = makeCtx()
    ctx.body = { user: { name: 'Alice' } }
    const next = vi.fn().mockResolvedValue(undefined)
    await validate({
      body: {
        user: {
          type: 'object',
          properties: { name: { type: 'string', required: true } },
        },
      },
    })(ctx, next)
    expect(next).toHaveBeenCalled()
  })
})

// ─── Array ────────────────────────────────────────────────────────────────────

describe('validate — array type', () => {
  it('passes a valid array', async () => {
    const ctx = makeCtx()
    ctx.body = { tags: ['a', 'b'] }
    const next = vi.fn().mockResolvedValue(undefined)
    await validate({ body: { tags: { type: 'array', items: { type: 'string' } } } })(ctx, next)
    expect(next).toHaveBeenCalled()
  })

  it('fails when an array item fails its item schema and reports indexed path', async () => {
    const ctx = makeCtx()
    ctx.body = { tags: ['a', 42, 'c'] }
    const jsonSpy = vi.spyOn(ctx, 'json')
    await validate({ body: { tags: { type: 'array', items: { type: 'string' } } } })(ctx, noop)
    const body = jsonSpy.mock.calls[0]?.[0] as { errors: { field: string }[] }
    expect(body.errors[0]?.field).toBe('body.tags[1]')
  })

  it('fails when value is not an array', async () => {
    const ctx = makeCtx()
    ctx.body = { tags: 'not-array' }
    const jsonSpy = vi.spyOn(ctx, 'json')
    await validate({ body: { tags: { type: 'array' } } })(ctx, noop)
    expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({ error: 'Validation failed' }), 422)
  })
})

// ─── Query params (string coercion) ──────────────────────────────────────────

describe('validate — query param coercion', () => {
  it('accepts a numeric string for type:number', async () => {
    // URL query string is parsed by createRequest — page arrives as '3'
    const ctx = makeCtx('/?page=3')
    const next = vi.fn().mockResolvedValue(undefined)
    await validate({ query: { page: { type: 'number', min: 1 } } })(ctx, next)
    expect(next).toHaveBeenCalled()
  })

  it('rejects a non-numeric string for type:number', async () => {
    const ctx = makeCtx('/?page=abc')
    const jsonSpy = vi.spyOn(ctx, 'json')
    await validate({ query: { page: { type: 'number' } } })(ctx, noop)
    expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({ error: 'Validation failed' }), 422)
  })

  it('accepts "true"/"false" for type:boolean', async () => {
    const ctx = makeCtx('/?dry=true')
    const next = vi.fn().mockResolvedValue(undefined)
    await validate({ query: { dry: { type: 'boolean' } } })(ctx, next)
    expect(next).toHaveBeenCalled()
  })

  it('rejects other strings for type:boolean', async () => {
    const ctx = makeCtx('/?dry=yes')
    const jsonSpy = vi.spyOn(ctx, 'json')
    await validate({ query: { dry: { type: 'boolean' } } })(ctx, noop)
    expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({ error: 'Validation failed' }), 422)
  })

  it('applies min/max to the coerced numeric value', async () => {
    const ctx = makeCtx('/?page=0')  // 0 is below min: 1
    const jsonSpy = vi.spyOn(ctx, 'json')
    await validate({ query: { page: { type: 'number', min: 1 } } })(ctx, noop)
    expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({ error: 'Validation failed' }), 422)
  })
})

// ─── Multiple errors & security side-effects ──────────────────────────────────

describe('validate — multiple errors and security side-effects', () => {
  it('reports all failing fields in one response', async () => {
    const ctx = makeCtx()
    ctx.body = {}  // name and email both missing
    const jsonSpy = vi.spyOn(ctx, 'json')
    await validate({
      body: {
        name:  { type: 'string', required: true },
        email: { type: 'string', required: true },
      },
    })(ctx, noop)
    const body = jsonSpy.mock.calls[0]?.[0] as { errors: unknown[] }
    expect(body.errors.length).toBe(2)
  })

  it('elevates entropy on validation failure', async () => {
    const ctx = makeCtx()
    ctx.body = {}
    await validate({ body: { name: { type: 'string', required: true } } })(ctx, noop)
    expect(ctx.kairo.entropy).toBeGreaterThan(0)
  })

  it('emits a security event on validation failure', async () => {
    const ctx = makeCtx()
    ctx.body = {}
    await validate({ body: { name: { type: 'string', required: true } } })(ctx, noop)
    expect(ctx.kairo.events).toHaveLength(1)
    expect(ctx.kairo.events[0]?.type).toBe('taint_neutralized')
  })

  it('does not call next() on failure', async () => {
    const ctx = makeCtx()
    ctx.body = {}
    const next = vi.fn()
    await validate({ body: { name: { type: 'string', required: true } } })(ctx, next)
    expect(next).not.toHaveBeenCalled()
  })

  it('calls next() when all fields pass', async () => {
    const ctx = makeCtx()
    ctx.body = { name: 'Alice', email: 'alice@example.com' }
    const next = vi.fn().mockResolvedValue(undefined)
    await validate({
      body: {
        name:  { type: 'string', required: true },
        email: { type: 'string', required: true, pattern: /^[^@]+@[^@]+$/ },
      },
    })(ctx, next)
    expect(next).toHaveBeenCalled()
  })

  it('caps entropy at 1.0 when already elevated', async () => {
    const ctx = makeCtx()
    ctx.body = {}
    ctx.kairo.entropy = 0.98
    await validate({ body: { name: { type: 'string', required: true } } })(ctx, noop)
    expect(ctx.kairo.entropy).toBe(1.0)
  })
})
