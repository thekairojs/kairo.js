import { randomBytes } from 'node:crypto'
import type { KairoContext } from 'kairo'
import { emitSecurityEvent } from 'kairo'

const CANARY_FIELD = '__k_c__'
const registry = new Map<string, { route: string; createdAt: number }>()

/** Max tokens in the registry — prevents unbounded memory growth. */
const REGISTRY_MAX = 100_000
/** Tokens older than this are eligible for eviction during overflow. 24 hours. */
const CANARY_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Evict the oldest entries when the registry is at capacity.
 * Called only on overflow — O(n) scan is acceptable at that boundary.
 */
function _evictOldest(): void {
  const cutoff = Date.now() - CANARY_TTL_MS
  // First pass: remove expired tokens
  for (const [token, entry] of registry) {
    if (entry.createdAt < cutoff) registry.delete(token)
    if (registry.size < REGISTRY_MAX) return
  }
  // Second pass: if still at cap, remove the single oldest entry
  let oldestToken: string | null = null
  let oldestTime = Infinity
  for (const [token, entry] of registry) {
    if (entry.createdAt < oldestTime) {
      oldestTime = entry.createdAt
      oldestToken = token
    }
  }
  if (oldestToken !== null) registry.delete(oldestToken)
}

export function createCanary<T extends Record<string, unknown>>(
  record: T,
  ctx?: KairoContext,
): T & { [CANARY_FIELD]: string } {
  if (registry.size >= REGISTRY_MAX) {
    _evictOldest()
  }
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

/**
 * Schedule automatic revocation of a canary token after `ms` milliseconds.
 * This is the safe default for most handlers — create a canary, use it,
 * let it self-destruct after the record's expected lifetime.
 *
 * ```ts
 * const row = createCanary({ id: userId, name: 'Alice' }, ctx)
 * revokeCanaryAfter(row.__k_c__, 5 * 60_000) // auto-revoke after 5 minutes
 * ```
 */
export function revokeCanaryAfter(token: string, ms: number): void {
  setTimeout(() => registry.delete(token), ms).unref()
}

export function canaryRegistrySize(): number {
  return registry.size
}

// Canary tokens are 16-byte hex strings stored in a process-level Map.
// They persist until revokeCanary() is called — callers should revoke after
// the record's expected lifetime to prevent registry growth.
// The CANARY_FIELD key is intentionally short and obscure — not __kairo_canary__,
// which an attacker scanning open-source code could strip before exfiltrating.
