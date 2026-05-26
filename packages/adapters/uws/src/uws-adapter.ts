import type { KairoApp } from '@thekairojs/kairo'
import type { ServerAdapter } from '@thekairojs/kairo'
import { createShimRequest, createShimResponse } from './shim.js'

// uWebSockets.js types — only the surface we use
interface UwsApp {
  any(pattern: string, handler: (res: UwsRes, req: UwsReq) => void): UwsApp
  listen(host: string, port: number, cb: (socket: unknown) => void): void
}

interface UwsReq {
  getMethod(): string
  getUrl(): string
  getQuery(): string
  forEach(cb: (key: string, value: string) => void): void
}

interface UwsRes {
  onAborted(cb: () => void): UwsRes
  onData(cb: (chunk: ArrayBuffer, isLast: boolean) => void): UwsRes
  cork(fn: () => void): void
  writeStatus(status: string): UwsRes
  writeHeader(key: string, value: string): UwsRes
  end(body?: string | ArrayBuffer): UwsRes
  getRemoteAddressAsText(): ArrayBuffer
}

interface UwsModule {
  App(): UwsApp
  SSLApp(opts: SslOptions): UwsApp
  us_listen_socket_close(socket: unknown): void
}

export interface SslOptions {
  cert_file_name: string
  key_file_name: string
  passphrase?: string
}

export interface UwsAdapterOptions {
  /** SSL config. When provided, creates an SSLApp instead of a plain App. */
  ssl?: SslOptions
}

/**
 * Replace KAIRO's default node:http server with uWebSockets.js.
 *
 * Usage:
 * ```ts
 * import { createApp } from '@thekairojs/kairo'
 * import { createUwsAdapter } from '@thekairojs/kairo-adapter-uws'
 *
 * const app = createApp()
 * // ...routes and middleware...
 *
 * const server = createUwsAdapter(app)
 * await server.listen(3000)
 * // app.close() not needed — use server.close() instead
 * ```
 */
export function createUwsAdapter(kairoApp: KairoApp, options: UwsAdapterOptions = {}): ServerAdapter {
  let listenSocket: unknown = null
  let uwsModule: UwsModule | null = null

  async function getUws(): Promise<UwsModule> {
    if (uwsModule) return uwsModule
    try {
      // dynamic import keeps uWebSockets.js as a true peer dep —
      // the process won't fail to start if the package isn't installed
      const mod = await import('uWebSockets.js' as string)
      uwsModule = mod as UwsModule
      return uwsModule
    } catch {
      throw new Error(
        '[kairo-adapter-uws] uWebSockets.js is not installed. ' +
        'Run: npm install uWebSockets.js',
      )
    }
  }

  return {
    async listen(port: number, hostname?: string) {
      const uws = await getUws()
      const handler = kairoApp.buildRequestHandler()
      const uwsApp = options.ssl ? uws.SSLApp(options.ssl) : uws.App()

      uwsApp.any('/*', (res: UwsRes, req: UwsReq) => {
        // Must register abort handler synchronously before any await
        let aborted = false
        res.onAborted(() => { aborted = true })

        const method   = req.getMethod().toUpperCase()
        const urlPath  = req.getUrl()
        const query    = req.getQuery()
        const fullUrl  = query ? `${urlPath}?${query}` : urlPath

        // Collect all request headers into a plain object
        const headers: Record<string, string> = {}
        req.forEach((key, value) => { headers[key] = value })

        // Decode the remote address from the ArrayBuffer uWS provides
        const ip = Buffer.from(res.getRemoteAddressAsText()).toString()

        // Accumulate body chunks — uWS delivers them in parts
        const chunks: Buffer[] = []

        res.onData((chunk: ArrayBuffer, isLast: boolean) => {
          chunks.push(Buffer.from(chunk))

          if (isLast) {
            if (aborted) return

            const body    = Buffer.concat(chunks)
            const shimReq = createShimRequest(method, fullUrl, headers, ip, body)
            const shimRes = createShimResponse(res)

            // Hand off to KAIRO's full middleware + routing pipeline
            handler(
              shimReq as import('node:http').IncomingMessage,
              shimRes as import('node:http').ServerResponse,
            )
          }
        })
      })

      return new Promise<void>((resolve, reject) => {
        uwsApp.listen(hostname ?? '127.0.0.1', port, (socket: unknown) => {
          if (socket) {
            listenSocket = socket
            resolve()
          } else {
            reject(new Error(`[kairo-adapter-uws] Failed to listen on ${hostname ?? '127.0.0.1'}:${port}`))
          }
        })
      })
    },

    async close() {
      if (listenSocket && uwsModule) {
        uwsModule.us_listen_socket_close(listenSocket)
        listenSocket = null
      }
    },
  }
}
