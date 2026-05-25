import { randomBytes } from 'node:crypto'
import type { KairoContext } from 'kairo'
import { emitSecurityEvent } from 'kairo'

const CANARY_FIELD = '__k_c__'
const registry = new Map<string, { route: string; createdAt: number }>()

export function createCanary<T extends Record<string, unknown>>(
  record: T,
  ctx?: KairoContext,
): T & { [CANARY_FIELD]: string } {
  const token = randomBytes(16).toString('hex')
  registry.set(token, {
    route: ctx?.path ?? 'unknown',
    createdAt: Date.now(),
  })
  return { ...record, [CANARY_FIELD]: token }
}

export function isCanaryToken(token: string): boolean {
  return registry.has(token)
}

export function scanForCanary(data: unknown, ctx: KairoContext): boolean {
  const found = _scan(data)
  if (found) {
    ctx.kairo.entropy = Math.min(ctx.kairo.entropy + 0.5, 1.0)
    emitSecurityEvent(ctx, {
      type: 'canary_triggered',
      route: ctx.path,
      detail: `Canary token detected in response — possible data exfiltration`,
    })
  }
  return found
}

function _scan(data: unknown, visited = new Set<object>()): boolean {
  if (data === null || data === undefined) return false
  if (typeof data === 'string') return registry.has(data)
  if (typeof data !== 'object') return false
  if (visited.has(data as object)) return false
  visited.add(data as object)
  if (Array.isArray(data)) return (data as unknown[]).some(item => _scan(item, visited))
  const obj = data as Record<string, unknown>
  const token = obj[CANARY_FIELD]
  if (typeof token === 'string' && registry.has(token)) return true
  return Object.values(obj).some(v => _scan(v, visited))
}

export function revokeCanary(token: string): void {
  registry.delete(token)
}

export function canaryRegistrySize(): number {
  return registry.size
}

// Canary tokens are 16-byte hex strings stored in a process-level Map.
// They persist until revokeCanary() is called — callers should revoke after
// the record's expected lifetime to prevent registry growth.
// The CANARY_FIELD key is intentionally short and obscure — not __kairo_canary__,
// which an attacker scanning open-source code could strip before exfiltrating.
