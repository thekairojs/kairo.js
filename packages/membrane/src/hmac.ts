/**
 * HMAC Signed Payload Envelope — service-to-service request authentication.
 *
 * Pattern:
 *   Sender computes HMAC-SHA256 of the raw request body using a shared secret.
 *   The signature is sent as the `X-Kairo-Signature: sha256=<hex>` header.
 *   The receiver verifies using timing-safe comparison.
 *
 * Design decisions:
 * - Uses Node.js built-in `crypto` — no third-party deps.
 * - Timing-safe comparison (`timingSafeEqual`) prevents timing side-channel leaks.
 * - Constant-time even when lengths differ (padded comparison).
 * - Provides both a middleware factory and raw sign/verify functions.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { KairoContext, Middleware } from 'kairo'

export const SIGNATURE_HEADER = 'x-kairo-signature'
export const SIGNATURE_PREFIX = 'sha256='

export interface HmacOptions {
  /** Shared secret for HMAC computation. Must be at least 32 bytes. */
  secret: string
  /**
   * When true, a missing or invalid signature results in a 401 response.
   * When false (default), an invalid signature elevates entropy but does not block.
   */
  required?: boolean
  /** Custom header name — defaults to 'x-kairo-signature'. */
  headerName?: string
}

/**
 * Compute an HMAC-SHA256 signature for the given body.
 */
export function sign(body: string | Buffer, secret: string): string {
  const hmac = createHmac('sha256', secret)
  hmac.update(body)
  return SIGNATURE_PREFIX + hmac.digest('hex')
}

/**
 * Verify an HMAC-SHA256 signature in constant time.
 * Returns true only if the signature is present and matches.
 */
export function verify(body: string | Buffer, secret: string, signature: string): boolean {
  if (!signature.startsWith(SIGNATURE_PREFIX)) return false

  const expected = sign(body, secret)

  // Ensure both buffers are the same length for timingSafeEqual
  const expectedBuf = Buffer.from(expected, 'utf8')
  const receivedBuf = Buffer.from(signature, 'utf8')

  if (expectedBuf.length !== receivedBuf.length) {
    // Different lengths — definitively invalid, but still take constant time
    // by comparing against itself (result discarded)
    timingSafeEqual(expectedBuf, expectedBuf)
    return false
  }

  return timingSafeEqual(expectedBuf, receivedBuf)
}

/**
 * Creates a middleware that verifies the HMAC signature on incoming requests.
 *
 * Usage:
 * ```ts
 * import { verifySignature } from 'kairo-membrane'
 * app.use(verifySignature({ secret: process.env.SERVICE_SECRET! }))
 * ```
 */
export function verifySignature(options: HmacOptions): Middleware {
  const headerName = options.headerName ?? SIGNATURE_HEADER
  const required = options.required ?? false

  return async (ctx: KairoContext, next: () => Promise<void>) => {
    const sig = ctx.get(headerName)
    const sigStr = Array.isArray(sig) ? sig[0] : (sig ?? '')

    if (!sigStr) {
      if (required) {
        ctx.json({ error: 'Missing signature' }, 401)
        return
      }
      // Not required — just pass through
      await next()
      return
    }

    // Body must be a string or Buffer to verify
    const rawBody = ctx.body
    if (typeof rawBody !== 'string' && !Buffer.isBuffer(rawBody)) {
      if (required) {
        ctx.json({ error: 'Cannot verify signature: body not available as raw bytes' }, 400)
        return
      }
      await next()
      return
    }

    const bodyData = typeof rawBody === 'string' ? rawBody : rawBody
    const valid = verify(bodyData, options.secret, sigStr)

    if (!valid) {
      // Always elevate entropy on bad signature regardless of required setting
      ctx.kairo.entropy = Math.min(ctx.kairo.entropy + 0.35, 1.0)

      if (required) {
        ctx.json({ error: 'Invalid signature' }, 401)
        return
      }
    }

    await next()
  }
}
