import type { KairoContext, KairoPlugin, Middleware, SecurityEvent } from '@thekairojs/kairo'
import { emitSecurityEvent } from '@thekairojs/kairo'
import { scanForCanary } from './canary.js'

export interface SentinelOptions {
  // Heap delta in bytes that triggers a memory_pressure event. Default: 50MB.
  memoryThresholdBytes?: number
  // Scan outgoing ctx.json() responses for canary tokens. Default: true.
  scanResponses?: boolean
  // Emit memory_pressure events. Default: true.
  monitorMemory?: boolean
  // Called synchronously when any sentinel security event is emitted.
  onEvent?: (event: SecurityEvent) => void
}

export function createSentinel(options: SentinelOptions = {}): KairoPlugin {
  return {
    name: 'kairo-sentinel',
    version: '0.1.0',
    onRequest: createSentinelMiddleware(options),
  }
}

export function createSentinelMiddleware(options: SentinelOptions = {}): Middleware {
  const memThreshold = options.memoryThresholdBytes ?? 50 * 1024 * 1024
  const scanResponses = options.scanResponses ?? true
  const monitorMemory = options.monitorMemory ?? true
  const onEvent = options.onEvent

  return async (ctx: KairoContext, next: () => Promise<void>) => {
    const heapBefore = monitorMemory ? process.memoryUsage().heapUsed : 0

    if (scanResponses) {
      _patchJsonForCanary(ctx, onEvent)
    }

    await next()

    if (monitorMemory) {
      const delta = process.memoryUsage().heapUsed - heapBefore
      if (delta > memThreshold) {
        ctx.kairo.entropy = Math.min(ctx.kairo.entropy + 0.2, 1.0)
        emitSecurityEvent(ctx, {
          type: 'memory_pressure',
          route: ctx.path,
          detail: `Heap grew ${(delta / 1024 / 1024).toFixed(1)} MB during request (threshold ${(memThreshold / 1024 / 1024).toFixed(0)} MB)`,
        })
        onEvent?.(ctx.kairo.events[ctx.kairo.events.length - 1]!)
      }
    }
  }
}

function _patchJsonForCanary(ctx: KairoContext, onEvent?: (e: SecurityEvent) => void): void {
  const original = ctx.json.bind(ctx)
  ;(ctx as unknown as Record<string, unknown>)['json'] = function patchedJson(
    data: unknown,
    status?: number,
  ): void {
    if (data !== null && data !== undefined && typeof data === 'object') {
      const triggered = scanForCanary(data, ctx)
      if (triggered && onEvent) {
        const last = ctx.kairo.events[ctx.kairo.events.length - 1]
        if (last) onEvent(last)
      }
    }
    original(data, status)
  }
}

// The memory monitor takes a heap snapshot before the middleware chain and
// compares after. This catches handlers that allocate large buffers or leak
// during processing — useful for detecting zip-bomb / algorithmic complexity attacks.
//
// Response scanning patches ctx.json() for the duration of each request.
// It does not wrap ctx.text() or ctx.html() — canary records are always JSON objects.
