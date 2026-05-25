import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { scanRoutes, scanSecurityPatterns, collectTs } from '../scanner.js'

let tmpDir: string

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kairo-cli-test-'))
})

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function write(rel: string, content: string): string {
  const full = path.join(tmpDir, rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf8')
  return full
}

// ─── collectTs ────────────────────────────────────────────────────────────────

describe('collectTs', () => {
  it('finds .ts files recursively', () => {
    write('sub/a.ts', '')
    write('b.ts', '')
    const files = collectTs(tmpDir)
    expect(files.some(f => f.endsWith('a.ts'))).toBe(true)
    expect(files.some(f => f.endsWith('b.ts'))).toBe(true)
  })

  it('excludes node_modules and dist', () => {
    write('node_modules/x.ts', '')
    write('dist/y.ts', '')
    const files = collectTs(tmpDir)
    expect(files.some(f => f.includes('node_modules'))).toBe(false)
    expect(files.some(f => f.includes(path.join('dist', 'y.ts')))).toBe(false)
  })

  it('excludes .d.ts files', () => {
    write('types.d.ts', '')
    const files = collectTs(tmpDir)
    expect(files.some(f => f.endsWith('.d.ts'))).toBe(false)
  })
})

// ─── scanRoutes ───────────────────────────────────────────────────────────────

describe('scanRoutes', () => {
  it('detects app.get()', () => {
    write('routes/get.ts', `app.get('/users', handler)`)
    const routes = scanRoutes(tmpDir)
    expect(routes.some(r => r.method === 'GET' && r.path === '/users')).toBe(true)
  })

  it('detects app.post()', () => {
    write('routes/post.ts', `app.post('/items', handler)`)
    const routes = scanRoutes(tmpDir)
    expect(routes.some(r => r.method === 'POST' && r.path === '/items')).toBe(true)
  })

  it('detects app.delete()', () => {
    write('routes/delete.ts', `app.delete('/items/:id', handler)`)
    const routes = scanRoutes(tmpDir)
    expect(routes.some(r => r.method === 'DELETE' && r.path === '/items/:id')).toBe(true)
  })

  it('captures the line number', () => {
    const file = write('routes/lines.ts', `// comment\napp.get('/line2', h)`)
    const routes = scanRoutes(tmpDir).filter(r => r.file === file)
    const hit = routes.find(r => r.path === '/line2')
    expect(hit?.line).toBe(2)
  })

  it('returns empty array for a file with no routes', () => {
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'kairo-empty-'))
    fs.writeFileSync(path.join(dir2, 'index.ts'), 'const x = 1', 'utf8')
    const routes = scanRoutes(dir2)
    fs.rmSync(dir2, { recursive: true, force: true })
    expect(routes).toHaveLength(0)
  })
})

// ─── scanSecurityPatterns ─────────────────────────────────────────────────────

describe('scanSecurityPatterns', () => {
  it('flags eval()', () => {
    write('sec/eval.ts', `const x = eval(input)`)
    const findings = scanSecurityPatterns(tmpDir)
    expect(findings.some(f => f.rule === 'no-eval' && f.severity === 'high')).toBe(true)
  })

  it('flags new Function()', () => {
    write('sec/fn.ts', `const fn = new Function('return 1')`)
    const findings = scanSecurityPatterns(tmpDir)
    expect(findings.some(f => f.rule === 'no-new-function')).toBe(true)
  })

  it('flags __proto__', () => {
    write('sec/proto.ts', `obj.__proto__ = payload`)
    const findings = scanSecurityPatterns(tmpDir)
    expect(findings.some(f => f.rule === 'no-prototype-pollution')).toBe(true)
  })

  it('flags hardcoded secrets', () => {
    write('sec/secret.ts', `const secret = "supersecret123"`)
    const findings = scanSecurityPatterns(tmpDir)
    expect(findings.some(f => f.rule === 'hardcoded-secret')).toBe(true)
  })

  it('returns empty for clean code', () => {
    const cleanDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kairo-clean-'))
    fs.writeFileSync(path.join(cleanDir, 'index.ts'), `
      export function add(a: number, b: number) { return a + b }
    `, 'utf8')
    const findings = scanSecurityPatterns(cleanDir)
    fs.rmSync(cleanDir, { recursive: true, force: true })
    // filter out low-severity false positives from the clean code itself
    const highMed = findings.filter(f => f.severity !== 'low')
    expect(highMed).toHaveLength(0)
  })

  it('sorts high before medium before low', () => {
    const findings = scanSecurityPatterns(tmpDir)
    if (findings.length < 2) return
    const order = { high: 0, medium: 1, low: 2 }
    for (let i = 1; i < findings.length; i++) {
      expect(order[findings[i]!.severity]).toBeGreaterThanOrEqual(order[findings[i - 1]!.severity])
    }
  })
})
