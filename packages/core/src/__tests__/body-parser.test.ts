import { describe, it, expect } from 'vitest'
import { parseBody } from '../body-parser.js'
import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'

function makeReq(body: string, contentType: string, contentLength?: number): IncomingMessage {
  const stream = Readable.from([Buffer.from(body, 'utf-8')])
  const req = Object.assign(stream, {
    headers: {
      'content-type': contentType,
      ...(contentLength !== undefined ? { 'content-length': String(contentLength) } : {}),
    },
  })
  return req as unknown as IncomingMessage
}

describe('parseBody', () => {
  it('parses JSON body', async () => {
    const req = makeReq('{"hello":"world"}', 'application/json')
    const body = await parseBody(req)
    expect(body).toEqual({ hello: 'world' })
  })

  it('parses URL-encoded body', async () => {
    const req = makeReq('name=Alice&age=30', 'application/x-www-form-urlencoded')
    const body = await parseBody(req)
    expect(body).toEqual({ name: 'Alice', age: '30' })
  })

  it('parses plain text body', async () => {
    const req = makeReq('hello kairo', 'text/plain')
    const body = await parseBody(req)
    expect(body).toBe('hello kairo')
  })

  it('returns undefined for empty body', async () => {
    const req = makeReq('', 'application/json')
    const body = await parseBody(req)
    expect(body).toBeUndefined()
  })

  it('throws 400 on invalid JSON', async () => {
    const req = makeReq('{broken', 'application/json')
    await expect(parseBody(req)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('throws 413 when content-length exceeds maxSize', async () => {
    const req = makeReq('{"a":1}', 'application/json', 10_000)
    await expect(parseBody(req, { maxSize: 100 })).rejects.toMatchObject({ statusCode: 413 })
  })

  it('decodes URL-encoded values', async () => {
    const req = makeReq('city=New+York&country=US', 'application/x-www-form-urlencoded')
    const body = await parseBody(req) as Record<string, string>
    expect(body['city']).toBe('New York')
  })
})
