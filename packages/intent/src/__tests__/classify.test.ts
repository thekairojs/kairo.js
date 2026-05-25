import { describe, it, expect } from 'vitest'
import { classify } from '../classify.js'

const base = {
  ua:         'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  path:       '/api/users',
  accepts:    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  method:     'GET',
  hasAuth:    false,
  hasCookies: false,
}

// ─── Human ────────────────────────────────────────────────────────────────────

describe('classify — human', () => {
  it('identifies a browser by Mozilla UA + browser accept + cookies', () => {
    const r = classify({ ...base, hasCookies: true })
    expect(r.type).toBe('human')
    expect(r.confidence).toBeGreaterThan(0)
  })

  it('includes "browser accept header" signal', () => {
    const r = classify({ ...base })
    expect(r.signals).toContain('browser accept header')
  })

  it('includes "cookies present" when cookie header is set', () => {
    const r = classify({ ...base, hasCookies: true })
    expect(r.signals).toContain('cookies present')
  })
})

// ─── API ──────────────────────────────────────────────────────────────────────

describe('classify — api', () => {
  it('identifies an API client by auth header + json accept', () => {
    const r = classify({
      ua:         'my-service/1.0',
      path:       '/api/data',
      accepts:    'application/json',
      method:     'GET',
      hasAuth:    true,
      hasCookies: false,
    })
    expect(r.type).toBe('api')
  })

  it('includes "authorization header" signal', () => {
    const r = classify({ ...base, hasAuth: true })
    expect(r.signals).toContain('authorization header')
  })
})

// ─── Bot ──────────────────────────────────────────────────────────────────────

describe('classify — bot', () => {
  it('identifies googlebot', () => {
    const r = classify({ ...base, ua: 'Mozilla/5.0 (compatible; Googlebot/2.1)' })
    expect(r.type).toBe('bot')
    expect(r.confidence).toBeGreaterThan(0.5)
  })

  it('identifies a generic crawler by ua keyword', () => {
    const r = classify({ ...base, ua: 'MyCrawler/1.0 (+https://example.com/crawler)' })
    expect(r.type).toBe('bot')
  })
})

// ─── Scanner ──────────────────────────────────────────────────────────────────

describe('classify — scanner', () => {
  it('flags sqlmap user-agent', () => {
    const r = classify({ ...base, ua: 'sqlmap/1.7.8#stable (https://sqlmap.org)' })
    expect(r.type).toBe('scanner')
    expect(r.confidence).toBeGreaterThan(0.5)
  })

  it('flags nikto user-agent', () => {
    const r = classify({ ...base, ua: 'Nikto/2.1.6' })
    expect(r.type).toBe('scanner')
  })

  it('flags access to /.env', () => {
    const r = classify({ ...base, path: '/.env', ua: '' })
    expect(r.type).toBe('scanner')
    expect(r.signals.some(s => s.includes('.env'))).toBe(true)
  })

  it('flags missing user-agent as scanner signal', () => {
    const r = classify({ ...base, ua: undefined, accepts: undefined, hasCookies: false })
    expect(r.signals).toContain('missing user-agent')
  })
})

// ─── Unknown ──────────────────────────────────────────────────────────────────

describe('classify — unknown', () => {
  it('returns unknown when no signals match', () => {
    const r = classify({ ua: 'obscure-client/0.1', path: '/healthz', accepts: undefined, method: 'GET', hasAuth: false, hasCookies: false })
    expect(r.type).toBe('unknown')
    expect(r.confidence).toBe(0)
  })
})

// ─── Confidence ───────────────────────────────────────────────────────────────

describe('classify — confidence', () => {
  it('returns confidence in [0, 1]', () => {
    const cases = [
      base,
      { ...base, ua: 'sqlmap/1.7' },
      { ...base, ua: 'Googlebot' },
      { ...base, hasAuth: true, accepts: 'application/json' },
    ]
    for (const c of cases) {
      const { confidence } = classify(c)
      expect(confidence).toBeGreaterThanOrEqual(0)
      expect(confidence).toBeLessThanOrEqual(1)
    }
  })
})
