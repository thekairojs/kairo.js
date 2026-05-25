import type { IncomingMessage } from 'node:http'

const MAX_BODY_SIZE = 1024 * 1024 // 1MB default
const DEFAULT_READ_TIMEOUT_MS = 30_000 // 30 seconds

// Keys that must never be assigned to prevent prototype pollution
const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty'])

export interface BodyParserOptions {
  maxSize?: number
  allowedTypes?: string[]
  readTimeoutMs?: number
}

export async function parseBody(
  req: IncomingMessage,
  options: BodyParserOptions = {},
): Promise<unknown> {
  const maxSize = options.maxSize ?? MAX_BODY_SIZE
  const readTimeoutMs = options.readTimeoutMs ?? DEFAULT_READ_TIMEOUT_MS
  const contentType = req.headers['content-type'] ?? ''
  const contentLength = req.headers['content-length']

  if (contentLength !== undefined) {
    const length = parseInt(contentLength, 10)
    if (!Number.isNaN(length) && length > maxSize) {
      const err = new Error('Request body too large')
      ;(err as Error & { statusCode: number }).statusCode = 413
      throw err
    }
  }

  const raw = await readRawBody(req, maxSize, readTimeoutMs)
  if (raw.length === 0) return undefined

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(raw.toString('utf-8'))
    } catch {
      const err = new Error('Invalid JSON body')
      ;(err as Error & { statusCode: number }).statusCode = 400
      throw err
    }
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return parseUrlEncoded(raw.toString('utf-8'))
  }

  if (contentType.includes('text/')) {
    return raw.toString('utf-8')
  }

  return raw
}

function readRawBody(req: IncomingMessage, maxSize: number, readTimeoutMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // C4: single-settle guard — prevents double resolve/reject
    let settled = false

    function settle(fn: () => void): void {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }

    // M1: Slow Loris protection — reject if body not received within timeout
    const timer = setTimeout(() => {
      req.destroy()
      const err = new Error('Request body read timeout')
      ;(err as Error & { statusCode: number }).statusCode = 408
      settle(() => reject(err))
    }, readTimeoutMs)

    const chunks: Buffer[] = []
    let totalLength = 0

    const onData = (chunk: Buffer) => {
      totalLength += chunk.length
      if (totalLength > maxSize) {
        // C4: remove the data listener immediately to stop accumulation
        req.removeListener('data', onData)
        req.destroy()
        const err = new Error('Request body too large')
        ;(err as Error & { statusCode: number }).statusCode = 413
        // C4: settle immediately — subsequent error/end events are ignored
        settle(() => reject(err))
        return
      }
      chunks.push(chunk)
    }

    req.on('data', onData)

    req.on('end', () => {
      settle(() => resolve(Buffer.concat(chunks)))
    })

    req.on('error', (err) => {
      settle(() => reject(err))
    })
  })
}

function parseUrlEncoded(body: string): Record<string, string> {
  // Use Object.create(null) to avoid prototype pollution
  const result = Object.create(null) as Record<string, string>
  for (const pair of body.split('&')) {
    if (!pair) continue
    const eqIdx = pair.indexOf('=')
    if (eqIdx === -1) {
      // M5: apply + → space decoding on key too
      let key: string
      try { key = decodeURIComponent(pair.replace(/\+/g, ' ')) } catch { continue }
      if (BLOCKED_KEYS.has(key)) continue
      result[key] = ''
    } else {
      // M5: apply + → space decoding on key
      let key: string
      let value: string
      try { key = decodeURIComponent(pair.slice(0, eqIdx).replace(/\+/g, ' ')) } catch { continue }
      if (BLOCKED_KEYS.has(key)) continue
      try { value = decodeURIComponent(pair.slice(eqIdx + 1).replace(/\+/g, ' ')) } catch { value = '' }
      result[key] = value
    }
  }
  return result
}
