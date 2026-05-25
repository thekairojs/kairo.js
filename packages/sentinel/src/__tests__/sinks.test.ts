import { describe, it, expect, beforeEach } from 'vitest'
import { checkSql, checkPath, checkShell, checkTemplate } from '../sinks.js'
import { createContext, createRequest, createResponse } from 'kairo'
import type { IncomingMessage, ServerResponse } from 'node:http'

function makeCtx(url = '/') {
  const raw = Object.assign(Object.create(null), {
    method: 'GET', url,
    headers: {}, socket: { remoteAddress: '127.0.0.1' },
  }) as unknown as IncomingMessage
  const rawRes = Object.assign(Object.create(null), {
    headersSent: false, setHeader() {}, writeHead() {}, end() {},
  }) as unknown as ServerResponse
  return createContext(createRequest(raw), createResponse(rawRes), {})
}

describe('checkSql', () => {
  it('returns null for clean input', () => {
    const ctx = makeCtx()
    expect(checkSql(ctx, 'alice@example.com')).toBeNull()
    expect(checkSql(ctx, 'SELECT from the menu')).toBeNull()
  })

  it('detects UNION SELECT injection', () => {
    const ctx = makeCtx()
    const v = checkSql(ctx, "1 UNION SELECT * FROM users")
    expect(v).not.toBeNull()
    expect(v?.sink).toBe('sql')
  })

  it('detects OR 1=1 pattern', () => {
    const ctx = makeCtx()
    expect(checkSql(ctx, "' OR '1'='1")).not.toBeNull()
  })

  it('detects DROP TABLE', () => {
    const ctx = makeCtx()
    expect(checkSql(ctx, 'DROP TABLE users')).not.toBeNull()
  })

  it('detects comment injection (--)', () => {
    const ctx = makeCtx()
    expect(checkSql(ctx, "admin'--")).not.toBeNull()
  })

  it('detects stacked queries', () => {
    const ctx = makeCtx()
    expect(checkSql(ctx, "1; DROP TABLE users")).not.toBeNull()
  })

  it('elevates entropy on detection', () => {
    const ctx = makeCtx()
    checkSql(ctx, '1 UNION SELECT null,null')
    expect(ctx.kairo.entropy).toBeGreaterThan(0)
  })

  it('emits a security event on detection', () => {
    const ctx = makeCtx()
    checkSql(ctx, '1 UNION SELECT null,null')
    expect(ctx.kairo.events).toHaveLength(1)
    expect(ctx.kairo.events[0]?.type).toBe('taint_neutralized')
  })

  it('marks tainted=true when taintPath is in taintedPaths', () => {
    const ctx = makeCtx()
    ctx.kairo.taintedPaths.add('query.id')
    const v = checkSql(ctx, "1 UNION SELECT null", 'query.id')
    expect(v?.tainted).toBe(true)
  })

  it('marks tainted=false when taintPath is not in taintedPaths', () => {
    const ctx = makeCtx()
    const v = checkSql(ctx, "1 UNION SELECT null", 'query.id')
    expect(v?.tainted).toBe(false)
  })

  it('truncates very long values in violation output', () => {
    const ctx = makeCtx()
    const long = 'a'.repeat(500) + ' UNION SELECT null'
    const v = checkSql(ctx, long)
    expect(v?.value.length).toBeLessThanOrEqual(200)
  })
})

describe('checkPath', () => {
  it('returns null for clean paths', () => {
    const ctx = makeCtx()
    expect(checkPath(ctx, '/users/profile')).toBeNull()
    expect(checkPath(ctx, '/api/v2/data')).toBeNull()
  })

  it('detects path traversal (../)', () => {
    const ctx = makeCtx()
    expect(checkPath(ctx, '../../etc/passwd')).not.toBeNull()
  })

  it('detects URL-encoded traversal', () => {
    const ctx = makeCtx()
    expect(checkPath(ctx, '%2e%2e%2fetc%2fpasswd')).not.toBeNull()
  })

  it('detects /etc/passwd', () => {
    const ctx = makeCtx()
    expect(checkPath(ctx, '/etc/passwd')).not.toBeNull()
  })

  it('detects null byte injection', () => {
    const ctx = makeCtx()
    expect(checkPath(ctx, '/safe/path\0.txt')).not.toBeNull()
  })
})

describe('checkShell', () => {
  it('returns null for clean input', () => {
    const ctx = makeCtx()
    expect(checkShell(ctx, 'ls -la')).toBeNull()
    expect(checkShell(ctx, 'my-filename.txt')).toBeNull()
  })

  it('detects semicolon chaining', () => {
    const ctx = makeCtx()
    expect(checkShell(ctx, 'safe; rm -rf /')).not.toBeNull()
  })

  it('detects pipe injection', () => {
    const ctx = makeCtx()
    expect(checkShell(ctx, 'echo hello | cat /etc/passwd')).not.toBeNull()
  })

  it('detects backtick execution', () => {
    const ctx = makeCtx()
    expect(checkShell(ctx, 'file`whoami`.txt')).not.toBeNull()
  })

  it('detects $() substitution', () => {
    const ctx = makeCtx()
    expect(checkShell(ctx, 'name$(id)')).not.toBeNull()
  })

  it('detects && chaining', () => {
    const ctx = makeCtx()
    expect(checkShell(ctx, 'safe && rm -rf /')).not.toBeNull()
  })
})

describe('checkTemplate', () => {
  it('returns null for clean strings', () => {
    const ctx = makeCtx()
    expect(checkTemplate(ctx, 'Hello Alice')).toBeNull()
    expect(checkTemplate(ctx, 'Price: $10.00')).toBeNull()
  })

  it('detects Handlebars/Mustache injection ({{ }})', () => {
    const ctx = makeCtx()
    expect(checkTemplate(ctx, '{{constructor.constructor("return process")()}}')).not.toBeNull()
  })

  it('detects JS template literal injection (${})', () => {
    const ctx = makeCtx()
    expect(checkTemplate(ctx, '${7*7}')).not.toBeNull()
  })

  it('detects ERB-style injection (<%= %>)', () => {
    const ctx = makeCtx()
    expect(checkTemplate(ctx, '<%= system("id") %>')).not.toBeNull()
  })

  it('detects Ruby-style #{} injection', () => {
    const ctx = makeCtx()
    expect(checkTemplate(ctx, '#{7*7}')).not.toBeNull()
  })
})
