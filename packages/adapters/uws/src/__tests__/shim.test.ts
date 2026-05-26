import { describe, it, expect, vi } from 'vitest'
import { createShimRequest, createShimResponse } from '../shim.js'

describe('createShimRequest', () => {
  it('sets method, url, headers, and socket.remoteAddress', () => {
    const req = createShimRequest('POST', '/api/test?x=1', { 'content-type': 'application/json' }, '1.2.3.4', Buffer.alloc(0))
    expect(req.method).toBe('POST')
    expect(req.url).toBe('/api/test?x=1')
    expect((req.headers as Record<string, string>)['content-type']).toBe('application/json')
    expect((req.socket as { remoteAddress: string }).remoteAddress).toBe('1.2.3.4')
  })

  it('emits data then end events on next tick', async () => {
    const body = Buffer.from('hello')
    const req = createShimRequest('POST', '/', {}, '127.0.0.1', body)

    const chunks: Buffer[] = []
    await new Promise<void>((resolve) => {
      req.on('data', (chunk) => chunks.push(chunk as Buffer))
      req.on('end', resolve)
    })

    expect(Buffer.concat(chunks).toString()).toBe('hello')
  })

  it('emits only end when body is empty', async () => {
    const req = createShimRequest('GET', '/', {}, '127.0.0.1', Buffer.alloc(0))
    const dataFired = vi.fn()
    await new Promise<void>((resolve) => {
      req.on('data', dataFired)
      req.on('end', resolve)
    })
    expect(dataFired).not.toHaveBeenCalled()
  })
})

describe('createShimResponse', () => {
  function makeUwsRes() {
    let corked = false
    const calls: string[] = []
    return {
      cork(fn: () => void) { corked = true; fn() },
      writeStatus(s: string) { calls.push(`status:${s}`); return this },
      writeHeader(k: string, v: string) { calls.push(`header:${k}=${v}`); return this },
      end(body?: string) { calls.push(`end:${body ?? ''}`); return this },
      _calls: calls,
      _corked: () => corked,
    }
  }

  it('accumulates setHeader calls and writes them all in end()', () => {
    const uws = makeUwsRes()
    const res = createShimResponse(uws as never)

    res.setHeader('content-type', 'application/json')
    res.writeHead(201)
    res.end('{"ok":true}')

    expect(uws._calls).toContain('status:201')
    expect(uws._calls).toContain('header:content-type=application/json')
    expect(uws._calls).toContain('end:{"ok":true}')
    expect(uws._corked()).toBe(true)
  })

  it('is idempotent — second end() is a no-op', () => {
    const uws = makeUwsRes()
    const res = createShimResponse(uws as never)
    res.end('first')
    res.end('second')
    const endCalls = uws._calls.filter(c => c.startsWith('end:'))
    expect(endCalls).toHaveLength(1)
  })
})
