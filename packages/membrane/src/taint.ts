/**
 * Taint Propagation — marks all user-controlled input sources on `ctx.kairo.taintedPaths`.
 *
 * Phase 2 taint tracking is source-level: we mark WHICH fields came from untrusted
 * user input. Phase 3 (Runtime Sentinel) will use this to check if tainted data
 * reaches dangerous sinks (SQL, file paths, shell commands, etc.).
 *
 * Taint path format: `<source>.<key>`
 * Examples:
 *   - `query.id`         — from URL query string
 *   - `params.userId`    — from URL path parameter
 *   - `body.email`       — from request body (top-level key)
 *   - `body.user.name`   — from nested body path
 *   - `headers.x-api-key` — from request headers (if explicitly configured)
 *
 * The taint set is intentionally flat strings (not a proxy/interceptor) for
 * Phase 2 — zero runtime overhead on data access.
 */

import type { KairoContext } from 'kairo'

/** Maximum nesting depth to taint from a JSON body. Deep paths are expensive. */
const MAX_TAINT_DEPTH = 8

/**
 * Populate `ctx.kairo.taintedPaths` with all user-controlled input sources.
 * This is called once per request by the membrane middleware.
 */
export function propagateTaint(ctx: KairoContext): void {
  const tainted = ctx.kairo.taintedPaths

  // ── Query parameters ──────────────────────────────────────────────────────
  for (const key of Object.keys(ctx.query)) {
    tainted.add(`query.${key}`)
  }

  // ── Path parameters ───────────────────────────────────────────────────────
  for (const key of Object.keys(ctx.params)) {
    tainted.add(`params.${key}`)
  }

  // ── Request body ──────────────────────────────────────────────────────────
  if (ctx.body !== undefined && ctx.body !== null) {
    taintBody('body', ctx.body, tainted, 0)
  }
}

/**
 * Recursively mark body keys as tainted up to MAX_TAINT_DEPTH.
 */
function taintBody(prefix: string, value: unknown, tainted: Set<string>, depth: number): void {
  if (depth >= MAX_TAINT_DEPTH) return
  if (value === null || typeof value !== 'object') {
    // Leaf value — the prefix itself is tainted
    tainted.add(prefix)
    return
  }

  // Buffer is an object but enumerating its integer indices (0, 1, 2, ...) is
  // useless for taint tracking and expensive for large payloads. Treat it as
  // an opaque tainted leaf instead.
  if (Buffer.isBuffer(value)) {
    tainted.add(prefix)
    return
  }

  if (Array.isArray(value)) {
    // Arrays: taint the array path and up to 20 elements (avoid massive payloads)
    tainted.add(prefix)
    const arr = value as unknown[]
    const limit = Math.min(arr.length, 20)
    for (let i = 0; i < limit; i++) {
      taintBody(`${prefix}[${i}]`, arr[i], tainted, depth + 1)
    }
    return
  }

  const obj = value as Record<string, unknown>
  for (const [key, val] of Object.entries(obj)) {
    const childPath = `${prefix}.${key}`
    tainted.add(childPath)
    if (val !== null && typeof val === 'object') {
      taintBody(childPath, val, tainted, depth + 1)
    }
  }
}

/**
 * Check whether a specific path is tainted. Convenience helper for sentinel layers.
 *
 * @example
 * if (isTainted(ctx, 'body.username')) { ... }
 */
export function isTainted(ctx: KairoContext, path: string): boolean {
  return ctx.kairo.taintedPaths.has(path)
}

/**
 * Check whether any prefix of a dotted path is tainted.
 * E.g., if `body.user` is tainted, `isAncestorTainted(ctx, 'body.user.name')` returns true.
 */
export function isAncestorTainted(ctx: KairoContext, path: string): boolean {
  const parts = path.split('.')
  let current = ''
  for (const part of parts) {
    current = current ? `${current}.${part}` : part
    if (ctx.kairo.taintedPaths.has(current)) return true
  }
  return false
}
