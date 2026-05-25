import path from 'node:path'
import fs from 'node:fs'
import { bold, c, dim } from '../ui/ansi.js'
import { table, divider, badge, indent } from '../ui/layout.js'
import { spinner } from '../ui/spinner.js'
import { scanSecurityPatterns, type SecurityFinding } from '../scanner.js'

// ─── Severity colour ──────────────────────────────────────────────────────────

function colorSeverity(sev: SecurityFinding['severity']): string {
  if (sev === 'high')   return c('red',    'HIGH  ')
  if (sev === 'medium') return c('yellow', 'MEDIUM')
  return c('gray', 'LOW   ')
}

// ─── Command ──────────────────────────────────────────────────────────────────

export interface AuditOptions {
  src?: string
}

export async function runAudit(opts: AuditOptions = {}): Promise<void> {
  const srcDir = path.resolve(opts.src ?? 'src')

  if (!fs.existsSync(srcDir)) {
    console.error(c('red', 'Error:') + ` src directory not found: ${srcDir}`)
    process.exit(1)
  }

  const spin = spinner('Scanning for security patterns…')
  const findings = scanSecurityPatterns(srcDir)
  spin.stop(`${badge('done', 'ok')} scan complete — ${findings.length} finding${findings.length !== 1 ? 's' : ''}`)

  console.log()

  if (findings.length === 0) {
    console.log(c('green', '  ✓ No issues found'))
    console.log()
    return
  }

  const high   = findings.filter(f => f.severity === 'high')
  const medium = findings.filter(f => f.severity === 'medium')
  const low    = findings.filter(f => f.severity === 'low')

  const summary = [
    high.length   ? c('red',    `${high.length} high`)   : '',
    medium.length ? c('yellow', `${medium.length} medium`) : '',
    low.length    ? c('gray',   `${low.length} low`)    : '',
  ].filter(Boolean).join('  ')

  console.log(divider(`${bold(String(findings.length))} findings  ${summary}`))
  console.log()

  const rows = findings.map(f => ({
    Severity: colorSeverity(f.severity),
    Rule:     bold(f.rule),
    Location: dim(`${path.relative(process.cwd(), f.file)}:${f.line}`),
    Detail:   f.detail,
  }))

  console.log(table(rows, { gap: 2 }))
  console.log()

  if (high.length > 0) {
    console.log(divider('recommendations'))
    high.forEach(f => {
      console.log(indent(`${c('red', '●')} ${f.rule}  ${dim(f.fix ?? 'review manually')}`, 2))
    })
    console.log()
  }
}
