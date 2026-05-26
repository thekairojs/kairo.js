import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'

// Minimal uWS HttpResponse surface — only the methods we call
interface UwsResponse {
  cork(fn: () => void): void
  writeStatus(status: string): UwsResponse
  writeHeader(key: string, value: string): UwsResponse
  end(body?: string | ArrayBuffer | Uint8Array): UwsResponse
}

/**
 * Build a fake IncomingMessage from pre-buffered uWS data.
 * KAIRO's body-parser expects .on('data', ...) and .on('end', ...) — we emit
 * them via nextTick so the listener is always attached before they fire.
 */
export function createShimRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  remoteAddress: string,
  body: Buffer,
): IncomingMessage {
  const emitter = new EventEmitter()

  const req = Object.assign(emitter, {
    method,
    url,
    headers,
    socket: { remoteAddress },
    // body-parser may call destroy() on slow-loris timeout
    destroy() { emitter.removeAllListeners() },
  }) as unknown as IncomingMessage

  // Replay the pre-read body on the next tick
  process.nextTick(() => {
    if (body.length > 0) emitter.emit('data', body)
    emitter.emit('end')
  })

  return req
}

/**
 * Build a fake ServerResponse that writes into a uWS response.
 * KAIRO's context.ts calls: setHeader(), writeHead(), end() — in that order.
 * We batch everything into a single cork() call for optimal uWS performance.
 */
export function createShimResponse(uwsRes: UwsResponse): ServerResponse {
  const pendingHeaders: [string, string][] = []
  let statusCode = 200
  let sent = false

  const shim = {
    get headersSent() { return sent },

    setHeader(key: string, value: string | number | readonly string[]) {
      pendingHeaders.push([key.toLowerCase(), String(value)])
    },

    writeHead(code: number) {
      statusCode = code
    },

    end(body?: string | Buffer | Uint8Array) {
      if (sent) return
      sent = true

      uwsRes.cork(() => {
        uwsRes.writeStatus(String(statusCode))
        for (const [k, v] of pendingHeaders) {
          uwsRes.writeHeader(k, v)
        }
        if (body !== undefined && body !== null) {
          if (typeof body === 'string') {
            uwsRes.end(body)
          } else {
            // Buffer / Uint8Array — pass as ArrayBuffer slice
            const buf = Buffer.isBuffer(body) ? body : Buffer.from(body)
            uwsRes.end(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
          }
        } else {
          uwsRes.end()
        }
      })
    },
  }

  return shim as unknown as ServerResponse
}
