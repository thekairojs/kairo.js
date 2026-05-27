import { createHmac, timingSafeEqual } from 'node:crypto'

const SIG_VERSION = 'v1'

export function buildMessage(service: string, method: string, path: string, timestamp: number): string {
  return `${service}:${method.toUpperCase()}:${path}:${timestamp}`
}

export function sign(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message).digest('hex')
}

export function buildSignatureHeader(secret: string, service: string, method: string, path: string): string {
  const ts = Date.now()
  const msg = buildMessage(service, method, path, ts)
  const sig = sign(secret, msg)
  return `t=${ts},${SIG_VERSION}=${sig}`
}

export interface VerifyResult {
  ok: boolean
  reason?: string
}

export function verifySignature(
  secret: string,
  callerService: string,
  method: string,
  path: string,
  rawHeader: string,
  windowMs: number,
): VerifyResult {
  const parts = Object.fromEntries(rawHeader.split(',').map(p => p.split('=') as [string, string]))
  const ts = Number(parts['t'])
  const sig = parts[SIG_VERSION]

  if (!ts || Number.isNaN(ts)) return { ok: false, reason: 'missing timestamp' }
  if (!sig) return { ok: false, reason: 'missing signature' }

  const skew = Math.abs(Date.now() - ts)
  if (skew > windowMs) return { ok: false, reason: `timestamp outside window (skew ${skew}ms)` }

  const expected = sign(secret, buildMessage(callerService, method, path, ts))

  const sigBuf = Buffer.from(sig, 'hex')
  const expBuf = Buffer.from(expected, 'hex')

  if (sigBuf.length !== expBuf.length) return { ok: false, reason: 'signature mismatch' }
  if (!timingSafeEqual(sigBuf, expBuf)) return { ok: false, reason: 'signature mismatch' }

  return { ok: true }
}
