import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import type { ServerAdapter } from './types.js'

export type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void

export function createHttpAdapter(handler: RequestHandler): ServerAdapter {
  let server: Server | null = null

  return {
    async listen(port: number, hostname?: string) {
      return new Promise<void>((resolve, reject) => {
        server = createServer(handler)

        // L5: track open sockets so we can forcefully close them on shutdown
        const sockets = new Set<Socket>()
        server.on('connection', (socket: Socket) => {
          sockets.add(socket)
          socket.on('close', () => { sockets.delete(socket) })
        })

        // H3: use once() so the reject listener is removed after listen succeeds
        server.once('error', reject)

        // L1: default to 127.0.0.1 for development safety.
        // For production/Docker deployments, pass '0.0.0.0' explicitly.
        server.listen(port, hostname ?? '127.0.0.1', () => {
          resolve()
        })

        // Stash the sockets set on the server for use in close()
        ;(server as Server & { _kairSockets?: Set<Socket> })._kairSockets = sockets
      })
    },

    async close() {
      if (!server) return

      // Capture before nulling inside the callback — guards against the callback
      // firing synchronously and setting server = null before we call closeAllConnections
      const srv = server
      const sockets = (srv as Server & { _kairSockets?: Set<Socket> })._kairSockets

      return new Promise<void>((resolve, reject) => {
        srv.close((err) => {
          server = null
          if (err) reject(err)
          else resolve()
        })

        // L5: terminate keep-alive connections so close() doesn't hang
        if (typeof (srv as Server & { closeAllConnections?: () => void }).closeAllConnections === 'function') {
          // Node 18.2+ fast path
          ;(srv as Server & { closeAllConnections: () => void }).closeAllConnections()
        } else if (sockets) {
          // Fallback: manually destroy tracked sockets
          for (const socket of sockets) {
            socket.destroy()
          }
        }
      })
    },
  }
}
