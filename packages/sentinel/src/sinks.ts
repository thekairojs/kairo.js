import type { KairoContext } from '@thekairojs/kairo'
import { emitSecurityEvent } from '@thekairojs/kairo'

export type SinkType = 'sql' | 'path' | 'shell' | 'template'

export interface SinkViolation {
  sink: SinkType
  value: string
  tainted: boolean
  pattern: string
}

const SQL_PATTERNS = [
  /(\bUNION\b.{0,30}\bSELECT\b)/i,
  /(\bDROP\b.{0,20}\bTABLE\b)/i,
  /(\bINSERT\b.{0,20}\bINTO\b)/i,
  /(\bDELETE\b.{0,20}\bFROM\b\s+\w)/i,
  /(\bOR\b\s+['"]?\d+['"]?\s*=\s*['"]?\d)/i,
  /--\s*$/m,
  /;\s*(DROP|DELETE|INSERT|UPDATE|CREATE|ALTER)\b/i,
  /\/\*.*?\*\//s,
  /xp_cmdshell/i,
]

const PATH_PATTERNS = [
  /\.\.[/\\]/,
  /%2e%2e[%2f%5c]/i,
  /[/\\]etc[/\\]passwd/i,
  /[/\\]proc[/\\]self/i,
  /[/\\]windows[/\\]system32/i,
  /\0/,
]

const SHELL_PATTERNS = [
  /[;&|`$(){}[\]\\](?!\s*$)/,
  /\$\(/,
  /`[^`]+`/,
  /\|\s*\w/,
  /&&|\|\|/,
  />\s*\/|>>\s*\//,
  /\bexec\s*\(/i,
  /\beval\s*\(/i,
  /\bsystem\s*\(/i,
]

const TEMPLATE_PATTERNS = [
  /\{\{.*?\}\}/,
  /\$\{.*?\}/,
  /<%-.*?%>/,
  /<%=.*?%>/,
  /#\{.*?\}/,
]

const PATTERN_MAP: Record<SinkType, RegExp[]> = {
  sql: SQL_PATTERNS,
  path: PATH_PATTERNS,
  shell: SHELL_PATTERNS,
  template: TEMPLATE_PATTERNS,
}

function check(
  ctx: KairoContext,
  value: string,
  sink: SinkType,
  taintPath?: string,
): SinkViolation | null {
  const patterns = PATTERN_MAP[sink]
  const tainted = taintPath ? ctx.kairo.taintedPaths.has(taintPath) : false

  for (const re of patterns) {
    if (re.test(value)) {
      const violation: SinkViolation = { sink, value: value.slice(0, 200), tainted, pattern: re.source }
      ctx.kairo.entropy = Math.min(ctx.kairo.entropy + 0.3, 1.0)
      emitSecurityEvent(ctx, {
        type: 'taint_neutralized',
        route: ctx.path,
        detail: `${sink} injection pattern in ${tainted ? 'tainted' : 'untainted'} input: ${re.source}`,
      })
      return violation
    }
  }
  return null
}

export function checkSql(ctx: KairoContext, value: string, taintPath?: string): SinkViolation | null {
  return check(ctx, value, 'sql', taintPath)
}

export function checkPath(ctx: KairoContext, value: string, taintPath?: string): SinkViolation | null {
  return check(ctx, value, 'path', taintPath)
}

export function checkShell(ctx: KairoContext, value: string, taintPath?: string): SinkViolation | null {
  return check(ctx, value, 'shell', taintPath)
}

export function checkTemplate(ctx: KairoContext, value: string, taintPath?: string): SinkViolation | null {
  return check(ctx, value, 'template', taintPath)
}

// taintPath is the dot-notation key from ctx.kairo.taintedPaths, e.g. 'query.id' or 'body.name'.
// Passing it lets the sentinel know whether the violating value originated from user input.
