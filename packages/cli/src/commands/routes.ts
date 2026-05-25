import path from 'node:path'
import fs from 'node:fs'
import { bold, c, dim } from '../ui/ansi.js'
import { table, divider, badge } from '../ui/layout.js'
import { spinner } from '../ui/spinner.js'
import { scanRoutes, type FoundRoute } from '../scanner.js'

// ─── Method colour map ────────────────────────────────────────────────────────

const METHOD_COLOR: Record<string, (s: string) => string> = {
  GET:     s => c('green',   s),
  POST:    s => c('cyan',    s),
  PUT:     s => c('yellow',  s),
  PATCH:   s => c('magenta', s),
  DELETE:  s => c('red',     s),
  HEAD:    s => c('gray',    s),
  OPTIONS: s => c('gray',    s),
}

function colorMethod(method: string): string {
  const fn = METHOD_COLOR[method.toUpperCase()]
  return fn ? fn(method.padEnd(7)) : method.padEnd(7)
}

// ─── Dynamic import (best-effort) ────────────────────────────────────────────

async function tryDynamicRoutes(appPath: string): Promise<FoundRoute[] | null> {
  try {
    const mod = await import(path.resolve(appPath)) as Record<string, unknown>
    const appInst = (mod['default'] ?? mod['app']) as { getRoutes?: () => { method: string; path: string }[] } | null
    if (typeof appInst?.getRoutes === 'function') {
      return appInst.getRoutes().map(r => ({ method: r.method, path: r.path, file: appPath, line: 0 }))
    }
  } catch { /* silent — fall through to static */ }
  return null
}

// ─── Command ──────────────────────────────────────────────────────────────────

export interface RoutesOptions {
  src?: string
  app?: string
}

export async function runRoutes(opts: RoutesOptions = {}): Promise<void> {
  const srcDir = path.resolve(opts.src ?? 'src')

  if (!fs.existsSync(srcDir)) {
    console.error(c('red', 'Error:') + ` src directory not found: ${srcDir}`)
    process.exit(1)
  }

  const spin = spinner('Scanning routes…')

  let routes: FoundRoute[]

  // prefer dynamic import when --app given
  if (opts.app) {
    const dynamic = await tryDynamicRoutes(opts.app)
    if (dynamic) {
      routes = dynamic
      spin.stop(`${badge('dynamic', 'info')} loaded routes from app instance`)
    } else {
      routes = scanRoutes(srcDir)
      spin.stop(`${badge('static', 'info')} dynamic import failed, fell back to static scan`)
    }
  } else {
    routes = scanRoutes(srcDir)
    spin.stop(`${badge('static', 'info')} static scan complete`)
  }

  console.log()

  if (routes.length === 0) {
    console.log(dim('  no routes found'))
    return
  }

  console.log(divider(`${bold(String(routes.length))} routes`))
  console.log()

  const rows = routes.map(r => ({
    Method: colorMethod(r.method),
    Path:   c('white', r.path),
    File:   dim(`${path.relative(process.cwd(), r.file)}${r.line ? `:${r.line}` : ''}`),
  }))

  console.log(table(rows, { gap: 3 }))
  console.log()
}
