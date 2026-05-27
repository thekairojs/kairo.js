import { describe, it, expect } from 'vitest'
import { matchesPattern, routeAllowed } from '../routes.js'
import { buildSignatureHeader, verifySignature, sign, buildMessage } from '../signing.js'

// ─── Route pattern matching ───────────────────────────────────────────────────

describe('matchesPattern', () => {
  it('matches exact paths', () => {
    expect(matchesPattern('/users', '/users')).toBe(true)
    expect(matchesPattern('/users', '/users/1')).toBe(false)
  })

  it('matches wildcard suffix /*', () => {
    expect(matchesPattern('/users/*', '/users/123')).toBe(true)
    expect(matchesPattern('/users/*', '/users/123/nested')).toBe(true)
    expect(matchesPattern('/users/*', '/users')).toBe(true)
    expect(matchesPattern('/users/*', '/other')).toBe(false)
  })

  it('matches global wildcard', () => {
    expect(matchesPattern('*', '/anything')).toBe(true)
    expect(matchesPattern('/*', '/anything')).toBe(true)
  })

  it('prefix wildcard', () => {
    expect(matchesPattern('/api*', '/api/v1')).toBe(true)
    expect(matchesPattern('/api*', '/other')).toBe(false)
  })
})

describe('routeAllowed', () => {
  it('returns true when any pattern matches', () => {
    expect(routeAllowed(['/health', '/users/*'], '/users/42')).toBe(true)
  })

  it('returns false when no pattern matches', () => {
    expect(routeAllowed(['/health', '/status'], '/admin')).toBe(false)
  })
})

// ─── HMAC signing ─────────────────────────────────────────────────────────────

describe('verifySignature', () => {
  const secret = 'test-secret-key'

  it('verifies a freshly built signature', () => {
    const header = buildSignatureHeader(secret, 'svc-a', 'GET', '/users')
    const result = verifySignature(secret, 'svc-a', 'GET', '/users', header, 30_000)
    expect(result.ok).toBe(true)
  })

  it('rejects a tampered signature', () => {
    const header = buildSignatureHeader(secret, 'svc-a', 'GET', '/users')
    const tampered = header.replace(/v1=.*/, 'v1=deadbeef')
    const result = verifySignature(secret, 'svc-a', 'GET', '/users', tampered, 30_000)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('signature mismatch')
  })

  it('rejects a stale timestamp', () => {
    const ts = Date.now() - 60_000
    const msg = buildMessage('svc-a', 'GET', '/users', ts)
    const sig = sign(secret, msg)
    const header = `t=${ts},v1=${sig}`
    const result = verifySignature(secret, 'svc-a', 'GET', '/users', header, 30_000)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('timestamp outside window')
  })

  it('rejects wrong method', () => {
    const header = buildSignatureHeader(secret, 'svc-a', 'POST', '/users')
    const result = verifySignature(secret, 'svc-a', 'GET', '/users', header, 30_000)
    expect(result.ok).toBe(false)
  })

  it('rejects missing timestamp', () => {
    const result = verifySignature(secret, 'svc-a', 'GET', '/users', 'v1=abc', 30_000)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('missing timestamp')
  })
})
