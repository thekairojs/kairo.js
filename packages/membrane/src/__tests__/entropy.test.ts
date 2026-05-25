import { describe, it, expect } from 'vitest'
import { computeEntropy, measureJsonDepth } from '../entropy.js'
import type { EntropyInput } from '../entropy.js'

function baseInput(overrides: Partial<EntropyInput> = {}): EntropyInput {
  return {
    method: 'GET',
    path: '/api/users',
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'accept': 'application/json',
      'accept-language': 'en-US,en;q=0.9',
      'host': 'example.com',
    },
    contentType: '',
    bodyLength: -1,
    bodyDepth: -1,
    ipSnapshot: {
      requestCount: 1,
      distinctPaths: 1,
      avgIntervalMs: Infinity,
      hasGhostHit: false,
    },
    trustProxy: false,
    ...overrides,
  }
}

describe('computeEntropy — output guarantees', () => {
  it('always returns a finite number in [0, 1]', () => {
    const result = computeEntropy(baseInput())
    expect(Number.isFinite(result.score)).toBe(true)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(1)
  })

  it('normal browser request has near-zero entropy', () => {
    const result = computeEntropy(baseInput())
    expect(result.score).toBeLessThan(0.15)
  })

  it('returns components object with all keys', () => {
    const result = computeEntropy(baseInput())
    expect(typeof result.components.header).toBe('number')
    expect(typeof result.components.ipBehavior).toBe('number')
    expect(typeof result.components.payload).toBe('number')
    expect(typeof result.components.timing).toBe('number')
  })

  it('returns a signals array', () => {
    const result = computeEntropy(baseInput())
    expect(Array.isArray(result.signals)).toBe(true)
  })
})

describe('computeEntropy — header signals', () => {
  it('missing user-agent raises entropy', () => {
    const result = computeEntropy(baseInput({
      headers: { 'accept': 'application/json', 'host': 'example.com' },
    }))
    expect(result.score).toBeGreaterThan(0)
    expect(result.signals.some(s => s.includes('user-agent'))).toBe(true)
  })

  it('scanner user-agent (sqlmap) raises entropy significantly', () => {
    const result = computeEntropy(baseInput({
      headers: { 'user-agent': 'sqlmap/1.7', 'host': 'example.com' },
    }))
    expect(result.score).toBeGreaterThan(0.10)
    expect(result.signals.some(s => s.includes('scanner'))).toBe(true)
  })

  it('curl user-agent raises entropy mildly', () => {
    const result = computeEntropy(baseInput({
      headers: { 'user-agent': 'curl/7.88.1', 'accept': '*/*', 'host': 'example.com' },
    }))
    expect(result.score).toBeGreaterThan(0)
    expect(result.signals.some(s => s.includes('automation'))).toBe(true)
  })

  it('missing accept header raises entropy', () => {
    const result = computeEntropy(baseInput({
      headers: {
        'user-agent': 'Mozilla/5.0',
        'host': 'example.com',
        'accept-language': 'en-US',
        // no accept
      },
    }))
    expect(result.signals.some(s => s.includes('accept'))).toBe(true)
  })
})

describe('computeEntropy — IP behavior signals', () => {
  it('high request count (≥200) raises entropy significantly', () => {
    const result = computeEntropy(baseInput({
      ipSnapshot: {
        requestCount: 200,
        distinctPaths: 5,
        avgIntervalMs: 1000,
        hasGhostHit: false,
      },
    }))
    expect(result.components.ipBehavior).toBeGreaterThan(0.30)
    expect(result.signals.some(s => s.includes('high request rate'))).toBe(true)
  })

  it('ghost route hit raises entropy', () => {
    const result = computeEntropy(baseInput({
      ipSnapshot: {
        requestCount: 2,
        distinctPaths: 2,
        avgIntervalMs: Infinity,
        hasGhostHit: true,
      },
    }))
    expect(result.signals.some(s => s.includes('ghost route'))).toBe(true)
    expect(result.components.ipBehavior).toBeGreaterThan(0)
  })

  it('rapid-fire requests (avg < 100ms, > 5 reqs) raises entropy', () => {
    const result = computeEntropy(baseInput({
      ipSnapshot: {
        requestCount: 10,
        distinctPaths: 3,
        avgIntervalMs: 50,
        hasGhostHit: false,
      },
    }))
    expect(result.signals.some(s => s.includes('rapid-fire'))).toBe(true)
  })

  it('wide path crawling (≥50 paths) raises entropy', () => {
    const result = computeEntropy(baseInput({
      ipSnapshot: {
        requestCount: 60,
        distinctPaths: 50,
        avgIntervalMs: 500,
        hasGhostHit: false,
      },
    }))
    expect(result.signals.some(s => s.includes('crawling wide path range'))).toBe(true)
  })
})

describe('computeEntropy — payload signals', () => {
  it('deeply nested payload (>20) raises entropy', () => {
    const result = computeEntropy(baseInput({
      bodyDepth: 25,
      bodyLength: 1000,
    }))
    expect(result.signals.some(s => s.includes('deeply nested'))).toBe(true)
    expect(result.components.payload).toBeGreaterThan(0)
  })

  it('near-limit body size (>900KB) raises entropy', () => {
    const result = computeEntropy(baseInput({
      bodyLength: 950_000,
    }))
    expect(result.signals.some(s => s.includes('near-limit body size'))).toBe(true)
  })

  it('unusual content-type raises entropy', () => {
    const result = computeEntropy(baseInput({
      contentType: 'application/x-malformed',
    }))
    expect(result.signals.some(s => s.includes('content-type'))).toBe(true)
  })
})

describe('computeEntropy — path/timing signals', () => {
  it('path traversal pattern raises entropy', () => {
    const result = computeEntropy(baseInput({ path: '/files/../../../etc/passwd' }))
    expect(result.signals.some(s => s.includes('injection probe'))).toBe(true)
    expect(result.components.timing).toBeGreaterThan(0)
  })

  it('SQL injection probe in path raises entropy', () => {
    const result = computeEntropy(baseInput({ path: "/api/users?id=1'%20union+select" }))
    expect(result.components.timing).toBeGreaterThan(0)
  })

  it('TRACE method raises entropy', () => {
    const result = computeEntropy(baseInput({ method: 'TRACE' }))
    expect(result.signals.some(s => s.includes('TRACE'))).toBe(true)
  })
})

describe('computeEntropy — edge cases (NaN / Infinity safety)', () => {
  it('handles NaN body length gracefully', () => {
    const result = computeEntropy(baseInput({ bodyLength: NaN }))
    expect(Number.isFinite(result.score)).toBe(true)
  })

  it('handles Infinity avgIntervalMs gracefully', () => {
    const result = computeEntropy(baseInput({
      ipSnapshot: { requestCount: 1, distinctPaths: 1, avgIntervalMs: Infinity, hasGhostHit: false },
    }))
    expect(Number.isFinite(result.score)).toBe(true)
  })

  it('all adversarial signals combined still clamps to 1.0', () => {
    const result = computeEntropy({
      method: 'TRACE',
      path: '/../../../etc/passwd',
      headers: {}, // no user-agent, no accept, no host
      contentType: 'application/x-evil',
      bodyLength: 999_999,
      bodyDepth: 30,
      ipSnapshot: {
        requestCount: 500,
        distinctPaths: 100,
        avgIntervalMs: 10,
        hasGhostHit: true,
      },
      trustProxy: false,
    })
    expect(result.score).toBeLessThanOrEqual(1.0)
    expect(Number.isFinite(result.score)).toBe(true)
  })
})

describe('measureJsonDepth', () => {
  it('returns 0 for primitives', () => {
    expect(measureJsonDepth(42)).toBe(0)
    expect(measureJsonDepth('hello')).toBe(0)
    expect(measureJsonDepth(null)).toBe(0)
  })

  it('returns 1 for flat object', () => {
    expect(measureJsonDepth({ a: 1, b: 2 })).toBe(1)
  })

  it('returns 1 for flat array', () => {
    expect(measureJsonDepth([1, 2, 3])).toBe(1)
  })

  it('returns 2 for nested object', () => {
    expect(measureJsonDepth({ a: { b: 1 } })).toBe(2)
  })

  it('measures deeply nested structures', () => {
    const deep = { a: { b: { c: { d: { e: 1 } } } } }
    expect(measureJsonDepth(deep)).toBe(5)
  })

  it('caps at 50 for pathological input', () => {
    // Build a 60-level deep object
    let obj: unknown = { leaf: true }
    for (let i = 0; i < 60; i++) obj = { nested: obj }
    const depth = measureJsonDepth(obj)
    expect(depth).toBeLessThanOrEqual(50)
  })
})
