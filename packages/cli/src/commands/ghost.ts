import path from 'node:path'
import fs from 'node:fs'
import { bold, c, dim } from '../ui/ansi.js'
import { box, divider, table, badge } from '../ui/layout.js'
import { spinner } from '../ui/spinner.js'
import { scanRoutes } from '../scanner.js'

// Ghost routes are paths that exist in code but are never wired to the
// router — common source of unguarded handlers. We detect them by scanning
// for handler functions not preceded by an app.* route registration.

export interface GhostOptions {
  src?: string
}

// Heuristic: find exported handler-shaped functions with no app.* call on
// the same or adjacent line. Not 100% accurate — flags for human review.
function detectGhostHandlers(srcDir: string): { file: string; line: number; name: string }[] {
  const ghosts: { file: string; line: number; name: string }[] = []
  const ts = collectFiles(srcDir, /\.(ts|js|mjs)$/)

  for (const file of ts) {
    const src = fs.readFileSync(file, 'utf8')
    const lines = src.split('\n')

    lines.forEach((line, idx) => {
      // look for exported async functions that take (ctx) — likely handlers
      const match = /export\s+(?:async\s+)?function\s+(\w+)\s*\(\s*ctx/.exec(line)
      if (!match) return

      const name = match[1]!
      // if the surrounding ±5 lines contain an app.* registration, skip
      const window = lines.slice(Math.max(0, idx - 5), idx + 6).join('\n')
      if (/app\.(get|post|put|patch|delete|head|options)\s*\(/.test(window)) return

      ghosts.push({ file, line: idx + 1, name })
    })
  }

  return ghosts
}

function collectFiles(dir: string, ext: RegExp): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      out.push(...collectFiles(full, ext))
    } else if (entry.isFile() && ext.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

export async function runGhost(opts: GhostOptions = {}): Promise<void> {
  const srcDir = path.resolve(opts.src ?? 'src')

  if (!fs.existsSync(srcDir)) {
    console.error(c('red', 'Error:') + ` src directory not found: ${srcDir}`)
    process.exit(1)
  }

  const spin = spinner('Scanning for ghost handlers…')
  const routes  = scanRoutes(srcDir)
  const ghosts  = detectGhostHandlers(srcDir)
  spin.stop(`${badge('done', 'ok')} scan complete`)

  console.log()
  console.log(divider('registered routes'))
  console.log()

  if (routes.length === 0) {
    console.log(dim('  none found'))
  } else {
    const rows = routes.map(r => ({
      Method: r.method.padEnd(7),
      Path:   r.path,
      File:   dim(`${path.relative(process.cwd(), r.file)}:${r.line}`),
    }))
    console.log(table(rows, { gap: 3 }))
  }

  console.log()
  console.log(divider(`${bold(String(ghosts.length))} potential ghost handlers`))
  console.log()

  if (ghosts.length === 0) {
    console.log(c('green', '  ✓ No ghost handlers detected'))
  } else {
    const warningLines = [
      c('yellow', 'Ghost handlers are exported functions that look like route'),
      c('yellow', 'handlers but have no matching app.* registration nearby.'),
      dim('These may be unguarded entry points — review each carefully.'),
    ]
    console.log(box(warningLines, { color: 'yellow' }))
    console.log()

    const rows = ghosts.map(g => ({
      Function: bold(g.name),
      Location: dim(`${path.relative(process.cwd(), g.file)}:${g.line}`),
    }))
    console.log(table(rows, { gap: 3 }))
  }

  console.log()
}
