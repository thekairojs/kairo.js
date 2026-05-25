import type { IntentType } from '@thekairojs/kairo'

// ─── Signal database ──────────────────────────────────────────────────────────

// Known scanner / attacker tools
const SCANNER_UA = [
  'sqlmap', 'nikto', 'dirbuster', 'dirb', 'gobuster', 'wfuzz', 'burpsuite',
  'nessus', 'openvas', 'nmap', 'masscan', 'zgrab', 'nuclei', 'metasploit',
  'acunetix', 'appscan', 'w3af', 'hydra', 'medusa', 'skipfish', 'wapiti',
  'owasp', 'python-requests/2', 'go-http-client/1.1',
]

// Known bot / crawler UAs
const BOT_UA = [
  'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider', 'yandexbot',
  'sogou', 'exabot', 'facebot', 'ia_archiver', 'semrushbot', 'ahrefsbot',
  'mj12bot', 'dotbot', 'rogerbot', 'screaming frog', 'seokicks', 'linkdexbot',
  'crawler', 'spider', 'scraper', 'bot',
]

// Paths frequently probed by scanners
const PROBE_PATHS = [
  '/admin', '/wp-admin', '/wp-login', '/phpmyadmin', '/phpinfo', '/.env',
  '/.git', '/config', '/backup', '/shell', '/webshell', '/.htaccess',
  '/etc/passwd', '/proc/self', '/actuator', '/swagger-ui', '/api-docs',
]

// Accept header patterns indicating a browser
const BROWSER_ACCEPT = ['text/html', 'application/xhtml']

export interface Classification {
  type: IntentType
  confidence: number
  signals: string[]
}

export function classify(opts: {
  ua:      string | undefined
  path:    string
  accepts: string | undefined
  method:  string
  hasAuth: boolean
  hasCookies: boolean
}): Classification {
  const { ua, path, accepts, method, hasAuth, hasCookies } = opts
  const signals: string[] = []
  const scores: Partial<Record<IntentType, number>> = {}

  const uaLower = (ua ?? '').toLowerCase()
  const pathLower = path.toLowerCase()

  // ── Scanner signals ──────────────────────────────────────────────────────
  for (const scanner of SCANNER_UA) {
    if (uaLower.includes(scanner)) {
      signals.push(`scanner ua: ${scanner}`)
      scores['scanner'] = (scores['scanner'] ?? 0) + 0.6
      break
    }
  }

  for (const probe of PROBE_PATHS) {
    if (pathLower.startsWith(probe)) {
      signals.push(`probe path: ${probe}`)
      scores['scanner'] = (scores['scanner'] ?? 0) + 0.3
      break
    }
  }

  if (!ua || ua.trim() === '') {
    signals.push('missing user-agent')
    scores['scanner'] = (scores['scanner'] ?? 0) + 0.2
  }

  // ── Bot signals ──────────────────────────────────────────────────────────
  for (const bot of BOT_UA) {
    if (uaLower.includes(bot)) {
      signals.push(`bot ua: ${bot}`)
      scores['bot'] = (scores['bot'] ?? 0) + 0.7
      break
    }
  }

  // ── Human signals ────────────────────────────────────────────────────────
  if (accepts) {
    for (const mime of BROWSER_ACCEPT) {
      if (accepts.includes(mime)) {
        signals.push('browser accept header')
        scores['human'] = (scores['human'] ?? 0) + 0.4
        break
      }
    }
  }

  if (hasCookies) {
    signals.push('cookies present')
    scores['human'] = (scores['human'] ?? 0) + 0.25
  }

  if (ua && /Mozilla\/5\.0/.test(ua)) {
    signals.push('mozilla user-agent')
    scores['human'] = (scores['human'] ?? 0) + 0.2
  }

  // ── API signals ──────────────────────────────────────────────────────────
  if (hasAuth) {
    signals.push('authorization header')
    scores['api'] = (scores['api'] ?? 0) + 0.4
  }

  if (accepts && accepts.includes('application/json') && !accepts.includes('text/html')) {
    signals.push('json-only accept')
    scores['api'] = (scores['api'] ?? 0) + 0.3
  }

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !hasCookies) {
    scores['api'] = (scores['api'] ?? 0) + 0.1
  }

  // ── Pick winner ──────────────────────────────────────────────────────────
  let best: IntentType = 'unknown'
  let bestScore = 0

  for (const [type, score] of Object.entries(scores) as [IntentType, number][]) {
    if (score > bestScore) {
      best = type
      bestScore = score
    }
  }

  // cap confidence at 1.0
  const confidence = Math.min(1.0, bestScore)

  return { type: best, confidence, signals }
}
