import fs from 'node:fs'
import path from 'node:path'

// ─── Route scanner ────────────────────────────────────────────────────────────

export interface FoundRoute {
  method: string
  path:   string
  file:   string
  line:   number
}

// Matches: app.get('/path', ...) or router.post('/path, ...)
const ROUTE_RE = /(?:app|router)\.(get|post|put|patch|delete|head|options)\s*\(\s*['"`]([^'"`]+)['"`]/gi

export function scanRoutes(dir: string): FoundRoute[] {
  const routes: FoundRoute[] = []
  for (const file of collectTs(dir)) {
    const src = fs.readFileSync(file, 'utf8')
    const lines = src.split('\n')
    lines.forEach((line, idx) => {
      let m: RegExpExecArray | null
      const re = new RegExp(ROUTE_RE.source, 'gi')
      while ((m = re.exec(line)) !== null) {
        routes.push({ method: m[1]!.toUpperCase(), path: m[2]!, file, line: idx + 1 })
      }
    })
  }
  return routes
}

// ─── Security pattern scanner ─────────────────────────────────────────────────

export interface SecurityFinding {
  rule:     string
  severity: 'high' | 'medium' | 'low'
  file:     string
  line:     number
  detail:   string
  fix?:     string
}

interface Rule {
  id:       string
  severity: SecurityFinding['severity']
  pattern:  RegExp
  detail:   string
  fix?:     string
}

const RULES: Rule[] = [
  {
    id:       'no-eval',
    severity: 'high',
    pattern:  /\beval\s*\(/,
    detail:   'eval() executes arbitrary code',
    fix:      'replace with JSON.parse or a safe alternative',
  },
  {
    id:       'no-new-function',
    severity: 'high',
    pattern:  /new\s+Function\s*\(/,
    detail:   'new Function() is equivalent to eval()',
    fix:      'use a safe serialization strategy instead',
  },
  {
    id:       'no-child-process-shell',
    severity: 'high',
    pattern:  /exec\s*\(\s*(?:`|\$\{|.*?\+)/,
    detail:   'dynamic shell command — possible injection',
    fix:      'use execFile() with a static command array',
  },
  {
    id:       'no-prototype-pollution',
    severity: 'high',
    pattern:  /\b__proto__\b|\bprototype\s*\[/,
    detail:   'prototype pollution vector',
    fix:      'use Object.create(null) and sanitize input keys',
  },
  {
    id:       'hardcoded-secret',
    severity: 'high',
    pattern:  /(?:password|secret|api_?key|token)\s*=\s*['"`][^'"`]{6,}/i,
    detail:   'possible hardcoded secret',
    fix:      'move to environment variable',
  },
  {
    id:       'sql-string-concat',
    severity: 'medium',
    pattern:  /(?:SELECT|INSERT|UPDATE|DELETE).*?\+\s*(?:req|ctx|params|body|query)/i,
    detail:   'SQL string concatenation — possible injection',
    fix:      'use parameterized queries',
  },
  {
    id:       'no-dangerous-regex',
    severity: 'medium',
    pattern:  /new RegExp\s*\(\s*(?:req|ctx|params|body|query)/,
    detail:   'user-controlled regex — ReDoS risk',
    fix:      'validate and escape input before building RegExp',
  },
  {
    id:       'missing-auth-middleware',
    severity: 'low',
    pattern:  /app\.(post|put|patch|delete)\s*\(/,
    detail:   'mutating route — verify auth middleware is applied',
    fix:      'ensure lattice.require() or equivalent is in the chain',
  },
  {
    id:       'console-log-data',
    severity: 'low',
    pattern:  /console\.log\s*\(.*(?:password|token|secret|key)/i,
    detail:   'sensitive field in console.log',
    fix:      'remove or redact before logging',
  },
]

export function scanSecurityPatterns(dir: string): SecurityFinding[] {
  const findings: SecurityFinding[] = []
  for (const file of collectTs(dir)) {
    const src = fs.readFileSync(file, 'utf8')
    const lines = src.split('\n')
    for (const rule of RULES) {
      lines.forEach((line, idx) => {
        if (rule.pattern.test(line)) {
          findings.push({
            rule:     rule.id,
            severity: rule.severity,
            file,
            line:     idx + 1,
            detail:   rule.detail,
            fix:      rule.fix,
          })
        }
      })
    }
  }

  // sort by severity then file/line
  const sOrder = { high: 0, medium: 1, low: 2 }
  findings.sort((a, b) => sOrder[a.severity] - sOrder[b.severity] || a.file.localeCompare(b.file) || a.line - b.line)
  return findings
}

// ─── File collector ───────────────────────────────────────────────────────────

export function collectTs(dir: string): string[] {
  const out: string[] = []
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist' && !entry.name.startsWith('.')) {
        out.push(...collectTs(full))
      } else if (entry.isFile() && /\.(ts|js|mjs|cjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        out.push(full)
      }
    }
  } catch { /* unreadable dir */ }
  return out
}
