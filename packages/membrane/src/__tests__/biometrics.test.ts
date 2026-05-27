import { describe, it, expect } from 'vitest'
import { analyzeSignals, BiometricsStore } from '../biometrics.js'
import type { BiometricsSignal } from '../biometrics.js'

describe('analyzeSignals', () => {
  it('gives a moderate score for empty signals', () => {
    const s: BiometricsSignal = { s: 'test-session', mx: [], ky: [], sc: [] }
    const result = analyzeSignals(s)
    expect(result.sessionId).toBe('test-session')
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(1)
  })

  it('scores higher for varied mouse movement', () => {
    const s: BiometricsSignal = {
      s: 'human-session',
      mx: [0.1, 0.3, 0.7, 0.2, 0.9, 0.4, 0.6, 0.8, 0.15, 0.55],
      ky: [120, 145, 90, 200, 110, 180, 95, 140],
      sc: [0, 50, 150, 250, 400],
    }
    const result = analyzeSignals(s)
    expect(result.score).toBeGreaterThan(0.5)
  })

  it('scores lower for monotone mouse movement', () => {
    const s: BiometricsSignal = {
      s: 'bot-session',
      mx: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      ky: [],
      sc: [],
    }
    const result = analyzeSignals(s)
    expect(result.score).toBeLessThan(0.5)
  })

  it('clamps score to [0, 1]', () => {
    const s: BiometricsSignal = { s: 'x', mx: Array(30).fill(0), ky: Array(10).fill(10), sc: [] }
    const result = analyzeSignals(s)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(1)
  })
})

describe('BiometricsStore', () => {
  it('stores and retrieves sessions', () => {
    const store = new BiometricsStore()
    const score = { sessionId: 'abc', score: 0.8, signals: [], updatedAt: Date.now() }
    store.set(score)
    expect(store.get('abc')).toEqual(score)
    expect(store.has('abc')).toBe(true)
    expect(store.has('xyz')).toBe(false)
  })
})
