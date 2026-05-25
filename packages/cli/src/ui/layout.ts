import { ansi, c, bold, dim, strip, visLen } from './ansi.js'

// ─── Box drawing ──────────────────────────────────────────────────────────────

const B = { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' }

export function box(lines: string[], opts: { width?: number; color?: string } = {}): string {
  const innerWidth = opts.width ?? Math.max(40, ...lines.map(l => visLen(l))) + 2
  const top    = `${B.tl}${B.h.repeat(innerWidth)}${B.tr}`
  const bottom = `${B.bl}${B.h.repeat(innerWidth)}${B.br}`

  const body = lines.map(line => {
    const pad = innerWidth - visLen(line) - 2
    return `${B.v} ${line}${' '.repeat(Math.max(0, pad))} ${B.v}`
  })

  const raw = [top, ...body, bottom].join('\n')
  return opts.color ? raw.replace(/[╭╮╰╯─│]/g, ch => `${ansi[opts.color as keyof typeof ansi] ?? ''}${ch}${ansi.reset}`) : raw
}

// ─── Banner ──────────────────────────────────────────────────────────────────

const LOGO = [
  ' ██╗  ██╗ █████╗ ██╗██████╗  ██████╗',
  ' ██║ ██╔╝██╔══██╗██║██╔══██╗██╔═══██╗',
  ' █████╔╝ ███████║██║██████╔╝██║   ██║',
  ' ██╔═██╗ ██╔══██║██║██╔══██╗██║   ██║',
  ' ██║  ██╗██║  ██║██║██║  ██║╚██████╔╝',
  ' ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝ ╚═════╝ ',
]

export function banner(version: string): string {
  const logo = LOGO.map(l => c('cyan', l)).join('\n')
  const tagline = dim('  security-substrate framework for Node.js')
  const ver = `  ${c('gray', `v${version}`)}`
  return `\n${logo}\n${tagline}\n${ver}\n`
}

// ─── Section divider ─────────────────────────────────────────────────────────

export function divider(label?: string, width = 60): string {
  if (!label) return c('gray', B.h.repeat(width))
  const stripped = strip(label)
  const side = Math.floor((width - stripped.length - 2) / 2)
  const left  = c('gray', B.h.repeat(Math.max(0, side)))
  const right = c('gray', B.h.repeat(Math.max(0, width - side - stripped.length - 2)))
  return `${left} ${label} ${right}`
}

// ─── Table ───────────────────────────────────────────────────────────────────

export interface TableRow { [col: string]: string }

export function table(rows: TableRow[], opts: { headers?: string[]; gap?: number } = {}): string {
  if (rows.length === 0) return ''
  const headers = opts.headers ?? Object.keys(rows[0]!)
  const gap = opts.gap ?? 2

  const widths = headers.map(h => {
    return Math.max(visLen(h), ...rows.map(r => visLen(r[h] ?? '')))
  })

  const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - visLen(s)))

  const header = headers.map((h, i) => bold(pad(h, widths[i]!))).join(' '.repeat(gap))
  const sep    = widths.map(w => c('gray', B.h.repeat(w))).join(' '.repeat(gap))
  const body   = rows.map(row =>
    headers.map((h, i) => pad(row[h] ?? '', widths[i]!)).join(' '.repeat(gap)),
  )

  return [header, sep, ...body].join('\n')
}

// ─── Status badge ─────────────────────────────────────────────────────────────

export function badge(text: string, kind: 'ok' | 'warn' | 'error' | 'info'): string {
  const colors: Record<string, keyof typeof ansi> = {
    ok:    'green',
    warn:  'yellow',
    error: 'red',
    info:  'cyan',
  }
  return c(colors[kind]!, `[${text}]`)
}

// ─── Indent helper ────────────────────────────────────────────────────────────

export function indent(text: string, n = 2): string {
  const pad = ' '.repeat(n)
  return text.split('\n').map(l => pad + l).join('\n')
}
