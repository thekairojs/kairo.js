import { describe, it, expect, beforeEach } from 'vitest'
import { IpTracker } from '../ip-tracker.js'

// Helper: build a tracker with no auto-sweep (sweepIntervalMs: 0) for deterministic tests
function makeTracker(windowMs = 15 * 60 * 1000, maxEntries?: number) {
  return new IpTracker({ windowMs, maxEntries, sweepIntervalMs: 0 })
}

describe('IpTracker — basic recording', () => {
  let tracker: IpTracker

  beforeEach(() => {
    tracker = makeTracker()
  })

  it('starts at 0 for a new IP', () => {
    const snap = tracker.peek('1.2.3.4')
    expect(snap.requestCount).toBe(0)
    expect(snap.distinctPaths).toBe(0)
    expect(snap.hasGhostHit).toBe(false)
  })

  it('records a single request', () => {
    const snap = tracker.record('1.2.3.4', '/api/users')
    expect(snap.requestCount).toBe(1)
    expect(snap.distinctPaths).toBe(1)
  })

  it('counts multiple requests from the same IP', () => {
    tracker.record('1.2.3.4', '/a')
    tracker.record('1.2.3.4', '/b')
    const snap = tracker.record('1.2.3.4', '/c')
    expect(snap.requestCount).toBe(3)
    expect(snap.distinctPaths).toBe(3)
  })

  it('deduplicates repeated paths', () => {
    tracker.record('1.2.3.4', '/a')
    tracker.record('1.2.3.4', '/a')
    const snap = tracker.record('1.2.3.4', '/a')
    expect(snap.requestCount).toBe(3)
    expect(snap.distinctPaths).toBe(1)
  })

  it('tracks ghost hits', () => {
    const snap = tracker.record('1.2.3.4', '/.env', true)
    expect(snap.hasGhostHit).toBe(true)
  })

  it('markGhostHit sets the ghost flag on existing record', () => {
    tracker.record('1.2.3.4', '/api')
    tracker.markGhostHit('1.2.3.4')
    const snap = tracker.peek('1.2.3.4')
    expect(snap.hasGhostHit).toBe(true)
  })

  it('markGhostHit is a no-op for unknown IP', () => {
    // Should not throw
    expect(() => tracker.markGhostHit('9.9.9.9')).not.toThrow()
    expect(tracker.peek('9.9.9.9').hasGhostHit).toBe(false)
  })

  it('ghost hit persists once set', () => {
    tracker.record('1.2.3.4', '/.env', true)
    const snap = tracker.record('1.2.3.4', '/normal', false)
    expect(snap.hasGhostHit).toBe(true)
  })

  it('evict removes the IP record', () => {
    tracker.record('1.2.3.4', '/a')
    tracker.evict('1.2.3.4')
    expect(tracker.peek('1.2.3.4').requestCount).toBe(0)
    expect(tracker.size).toBe(0)
  })
})

describe('IpTracker — rolling window expiry', () => {
  it('prunes entries outside the window', () => {
    const tracker = makeTracker(100)

    tracker.record('1.2.3.4', '/old')
    // Push back the visit timestamp to simulate expiry
    const rec = (tracker as unknown as { records: Map<string, { visits: { t: number; path: string }[] }> }).records.get('1.2.3.4')
    if (rec && rec.visits[0]) {
      rec.visits[0].t = Date.now() - 200 // 200ms ago, outside 100ms window
    }

    const snap = tracker.record('1.2.3.4', '/new')
    // The old entry should be pruned — only the new one remains
    expect(snap.requestCount).toBe(1)
  })
})

describe('IpTracker — avgIntervalMs', () => {
  it('is Infinity for a single request', () => {
    const snap = makeTracker().record('1.2.3.4', '/a')
    expect(snap.avgIntervalMs).toBe(Infinity)
  })

  it('computes avg interval for two requests', () => {
    const tracker = makeTracker()
    tracker.record('1.2.3.4', '/a')

    // Manipulate the visit timestamp to simulate a 1000ms gap
    const rec = (tracker as unknown as { records: Map<string, { visits: { t: number; path: string }[] }> }).records.get('1.2.3.4')
    if (rec && rec.visits[0]) {
      rec.visits[0].t = Date.now() - 1000
    }

    const snap = tracker.record('1.2.3.4', '/b')
    expect(snap.requestCount).toBe(2)
    // Allow some tolerance for execution time
    expect(snap.avgIntervalMs).toBeGreaterThan(900)
    expect(snap.avgIntervalMs).toBeLessThan(1200)
  })
})

describe('IpTracker — distinctPaths is window-bounded', () => {
  it('does not count paths from outside the rolling window', () => {
    const tracker = makeTracker(100) // 100ms window

    tracker.record('1.2.3.4', '/old-a')
    tracker.record('1.2.3.4', '/old-b')

    // Age those visits past the window
    const rec = (tracker as unknown as { records: Map<string, { visits: { t: number; path: string }[] }> }).records.get('1.2.3.4')
    if (rec) {
      for (const v of rec.visits) v.t = Date.now() - 200
    }

    // New request inside the window — only /new should count
    const snap = tracker.record('1.2.3.4', '/new')
    expect(snap.requestCount).toBe(1)
    expect(snap.distinctPaths).toBe(1)
  })
})

describe('IpTracker — different IPs', () => {
  it('tracks IPs independently', () => {
    const tracker = makeTracker()
    tracker.record('1.2.3.4', '/a')
    tracker.record('1.2.3.4', '/b')
    tracker.record('5.6.7.8', '/c')

    expect(tracker.peek('1.2.3.4').requestCount).toBe(2)
    expect(tracker.peek('5.6.7.8').requestCount).toBe(1)
    expect(tracker.size).toBe(2)
  })
})

describe('IpTracker — memory safety: max entries cap', () => {
  it('stays at maxEntries when cap is reached — evicts oldest', () => {
    const tracker = makeTracker(15 * 60 * 1000, 3)

    tracker.record('1.1.1.1', '/a')
    tracker.record('2.2.2.2', '/b')
    tracker.record('3.3.3.3', '/c')
    expect(tracker.size).toBe(3)

    // Adding a 4th IP should evict one (oldest by lastSeen)
    tracker.record('4.4.4.4', '/d')
    expect(tracker.size).toBe(3)
    // 4.4.4.4 must be in the tracker
    expect(tracker.peek('4.4.4.4').requestCount).toBe(1)
  })

  it('does not evict when under cap', () => {
    const tracker = makeTracker(15 * 60 * 1000, 100)
    for (let i = 0; i < 50; i++) {
      tracker.record(`10.0.0.${i}`, '/path')
    }
    expect(tracker.size).toBe(50)
  })

  it('re-uses existing record without eviction if IP already tracked', () => {
    const tracker = makeTracker(15 * 60 * 1000, 2)
    tracker.record('1.1.1.1', '/a')
    tracker.record('2.2.2.2', '/b')

    // Third call for existing IP — no eviction
    tracker.record('1.1.1.1', '/c')
    expect(tracker.size).toBe(2)
    expect(tracker.peek('1.1.1.1').requestCount).toBe(2)
  })
})

describe('IpTracker — sweep', () => {
  it('_sweep removes stale records (manual call)', () => {
    const tracker = makeTracker(100) // 100ms window
    tracker.record('1.1.1.1', '/a')

    // Age the lastSeen timestamp past the window
    const rec = (tracker as unknown as { records: Map<string, { lastSeen: number }> }).records.get('1.1.1.1')
    if (rec) rec.lastSeen = Date.now() - 200

    // Manually trigger the sweep
    ;(tracker as unknown as { _sweep(): void })._sweep()

    expect(tracker.size).toBe(0)
  })

  it('_sweep does not remove active records', () => {
    const tracker = makeTracker(60_000) // 1-minute window
    tracker.record('1.1.1.1', '/a')
    ;(tracker as unknown as { _sweep(): void })._sweep()
    expect(tracker.size).toBe(1)
  })
})

describe('IpTracker — destroy', () => {
  it('destroy() stops the sweep timer without throwing', () => {
    const tracker = new IpTracker({ sweepIntervalMs: 60_000 })
    expect(() => tracker.destroy()).not.toThrow()
    // Calling destroy twice should also be safe
    expect(() => tracker.destroy()).not.toThrow()
  })
})
