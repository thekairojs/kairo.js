import { describe, it, expect } from 'vitest'
import { sign, verify, SIGNATURE_PREFIX } from '../hmac.js'

const SECRET = 'super-secret-key-at-least-32-chars!!'

describe('sign()', () => {
  it('returns a string starting with sha256= prefix', () => {
    const sig = sign('hello body', SECRET)
    expect(sig.startsWith(SIGNATURE_PREFIX)).toBe(true)
  })

  it('returns a deterministic hex digest', () => {
    const sig1 = sign('hello body', SECRET)
    const sig2 = sign('hello body', SECRET)
    expect(sig1).toBe(sig2)
  })

  it('different bodies produce different signatures', () => {
    const sig1 = sign('body A', SECRET)
    const sig2 = sign('body B', SECRET)
    expect(sig1).not.toBe(sig2)
  })

  it('different secrets produce different signatures', () => {
    const sig1 = sign('hello', 'secret-one-32-chars-paddddddddddd')
    const sig2 = sign('hello', 'secret-two-32-chars-paddddddddddd')
    expect(sig1).not.toBe(sig2)
  })

  it('accepts Buffer input', () => {
    const body = Buffer.from('binary payload')
    const sig = sign(body, SECRET)
    expect(sig.startsWith(SIGNATURE_PREFIX)).toBe(true)
  })
})

describe('verify()', () => {
  it('returns true for a valid signature', () => {
    const body = 'request payload'
    const sig = sign(body, SECRET)
    expect(verify(body, SECRET, sig)).toBe(true)
  })

  it('returns false for tampered body', () => {
    const sig = sign('original body', SECRET)
    expect(verify('tampered body', SECRET, sig)).toBe(false)
  })

  it('returns false for wrong secret', () => {
    const body = 'request payload'
    const sig = sign(body, SECRET)
    expect(verify(body, 'wrong-secret-32-chars-paddddddddd', sig)).toBe(false)
  })

  it('returns false when prefix is missing', () => {
    const body = 'request payload'
    const sig = sign(body, SECRET).replace(SIGNATURE_PREFIX, '')
    expect(verify(body, SECRET, sig)).toBe(false)
  })

  it('returns false for empty signature', () => {
    expect(verify('body', SECRET, '')).toBe(false)
  })

  it('returns false for signature with correct prefix but wrong hex', () => {
    expect(verify('body', SECRET, SIGNATURE_PREFIX + 'deadbeef')).toBe(false)
  })

  it('returns false for completely wrong string', () => {
    expect(verify('body', SECRET, 'not-a-signature')).toBe(false)
  })

  it('handles Buffer body consistently with string body', () => {
    const body = 'test payload'
    const bufBody = Buffer.from(body, 'utf8')
    const sigFromString = sign(body, SECRET)
    const sigFromBuffer = sign(bufBody, SECRET)
    // Both should produce the same signature
    expect(sigFromString).toBe(sigFromBuffer)
    expect(verify(bufBody, SECRET, sigFromString)).toBe(true)
  })
})

describe('verify() — timing safety', () => {
  it('handles length mismatch without throwing', () => {
    // Different-length signature — must not throw even with timingSafeEqual
    const body = 'body'
    const shortSig = SIGNATURE_PREFIX + 'abc'
    expect(() => verify(body, SECRET, shortSig)).not.toThrow()
    expect(verify(body, SECRET, shortSig)).toBe(false)
  })

  it('handles very long forged signature', () => {
    const body = 'body'
    const longSig = SIGNATURE_PREFIX + 'a'.repeat(1000)
    expect(() => verify(body, SECRET, longSig)).not.toThrow()
    expect(verify(body, SECRET, longSig)).toBe(false)
  })
})
