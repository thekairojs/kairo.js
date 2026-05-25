import { describe, it, expect } from 'vitest'
import { scanForPii } from '../patterns.js'

describe('scanForPii — email', () => {
  it('detects an email in a string field', () => {
    const matches = scanForPii({ email: 'user@example.com' })
    expect(matches.some(m => m.field === 'email' && m.pattern === 'email')).toBe(true)
  })

  it('detects email nested inside an object', () => {
    const matches = scanForPii({ user: { contact: 'alice@corp.io' } })
    expect(matches.some(m => m.field === 'user.contact')).toBe(true)
  })

  it('does not flag a non-email string', () => {
    const matches = scanForPii({ name: 'Alice Smith' })
    expect(matches).toHaveLength(0)
  })
})

describe('scanForPii — credit card', () => {
  it('detects a Visa number', () => {
    const matches = scanForPii({ card: '4111111111111111' })
    expect(matches.some(m => m.pattern === 'credit-card')).toBe(true)
  })
})

describe('scanForPii — SSN', () => {
  it('detects a US SSN', () => {
    const matches = scanForPii({ ssn: '123-45-6789' })
    expect(matches.some(m => m.pattern === 'ssn')).toBe(true)
  })
})

describe('scanForPii — JWT', () => {
  it('detects a JWT token', () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.abc123def456'
    const matches = scanForPii({ token })
    expect(matches.some(m => m.pattern === 'jwt')).toBe(true)
  })
})

describe('scanForPii — AWS key', () => {
  it('detects an AWS access key', () => {
    const matches = scanForPii({ key: 'AKIAIOSFODNN7EXAMPLE' })
    expect(matches.some(m => m.pattern === 'aws-key')).toBe(true)
  })
})

describe('scanForPii — array traversal', () => {
  it('scans inside arrays and reports indexed paths', () => {
    const matches = scanForPii({ users: [{ email: 'a@b.com' }] })
    expect(matches.some(m => m.field === 'users[0].email')).toBe(true)
  })
})

describe('scanForPii — circular references', () => {
  it('does not throw on circular objects', () => {
    const obj: Record<string, unknown> = { name: 'test' }
    obj['self'] = obj
    expect(() => scanForPii(obj)).not.toThrow()
  })
})

describe('scanForPii — sample safety', () => {
  it('only exposes first 4 chars of a match', () => {
    const matches = scanForPii({ email: 'user@example.com' })
    const match = matches.find(m => m.pattern === 'email')
    expect(match?.sample.length).toBeLessThanOrEqual(4)
  })
})
