import { describe, it, expect } from 'vitest'
import { box, divider, table, badge, indent } from '../ui/layout.js'
import { strip, visLen } from '../ui/ansi.js'

// ─── ansi helpers ─────────────────────────────────────────────────────────────

describe('strip / visLen', () => {
  it('strips ANSI codes', () => {
    expect(strip('\x1b[32mhello\x1b[0m')).toBe('hello')
  })

  it('measures visual length correctly', () => {
    expect(visLen('\x1b[32mhello\x1b[0m')).toBe(5)
  })
})

// ─── box ──────────────────────────────────────────────────────────────────────

describe('box', () => {
  it('wraps lines in box-drawing characters', () => {
    const out = box(['hello'])
    expect(out).toContain('╭')
    expect(out).toContain('╯')
    expect(out).toContain('hello')
  })

  it('produces equal top and bottom border widths', () => {
    const out = box(['short', 'a much longer line here'])
    const lines = out.split('\n')
    const top    = strip(lines[0]!)
    const bottom = strip(lines[lines.length - 1]!)
    expect(top.length).toBe(bottom.length)
  })

  it('pads all content lines to the same width', () => {
    const out = box(['a', 'bb', 'ccc'])
    const lines = out.split('\n')
    const widths = lines.map(l => strip(l).length)
    expect(new Set(widths).size).toBe(1)
  })
})

// ─── divider ─────────────────────────────────────────────────────────────────

describe('divider', () => {
  it('returns a line of dashes when no label', () => {
    const out = strip(divider())
    expect(out).toMatch(/^─+$/)
  })

  it('includes the label when provided', () => {
    const out = strip(divider('section'))
    expect(out).toContain('section')
  })
})

// ─── table ────────────────────────────────────────────────────────────────────

describe('table', () => {
  it('renders column headers', () => {
    const out = strip(table([{ Name: 'Alice', Age: '30' }]))
    expect(out).toContain('Name')
    expect(out).toContain('Age')
  })

  it('renders row values', () => {
    const out = strip(table([{ Name: 'Alice', Age: '30' }]))
    expect(out).toContain('Alice')
    expect(out).toContain('30')
  })

  it('returns empty string for empty rows', () => {
    expect(table([])).toBe('')
  })

  it('pads columns to align values', () => {
    const out = strip(table([
      { Name: 'Alice', Role: 'admin' },
      { Name: 'Bob', Role: 'user' },
    ]))
    const lines = out.split('\n')
    // all data lines should start at same offset
    expect(lines[2]!.startsWith('Alice')).toBe(true)
    expect(lines[3]!.startsWith('Bob  ')).toBe(true)
  })
})

// ─── badge ────────────────────────────────────────────────────────────────────

describe('badge', () => {
  it('wraps text in brackets', () => {
    expect(strip(badge('ok', 'ok'))).toBe('[ok]')
  })

  it('renders for all severity kinds', () => {
    for (const kind of ['ok', 'warn', 'error', 'info'] as const) {
      const out = strip(badge('test', kind))
      expect(out).toBe('[test]')
    }
  })
})

// ─── indent ───────────────────────────────────────────────────────────────────

describe('indent', () => {
  it('prepends spaces to every line', () => {
    const out = indent('foo\nbar', 4)
    expect(out).toBe('    foo\n    bar')
  })

  it('defaults to 2 spaces', () => {
    const out = indent('x')
    expect(out).toBe('  x')
  })
})
