/**
 * Header Fingerprinting — scores a request's headers for anomaly signals.
 *
 * Returns a partial entropy contribution in [0.0, 1.0]. The caller is
 * responsible for combining scores from multiple signals.
 *
 * All rules are additive and clamped — a single rule cannot spike the total.
 */

export interface FingerprintResult {
  /** Partial entropy contribution from header analysis [0.0, 1.0] */
  score: number
  /** Human-readable reasons for each non-zero contribution */
  signals: string[]
}

// Patterns that strongly suggest automated scanning tools
const SCANNER_UA_PATTERNS = [
  /sqlmap/i,
  /nikto/i,
  /masscan/i,
  /nmap/i,
  /zgrab/i,
  /gobuster/i,
  /dirbuster/i,
  /dirb\b/i,
  /wfuzz/i,
  /burpsuite/i,
  /havij/i,
  /acunetix/i,
  /nessus/i,
]

// Patterns that mildly suggest automation (curl, scripts, etc.)
const AUTOMATION_UA_PATTERNS = [
  /^python-requests/i,
  /^python\//i,
  /^go-http-client/i,
  /^java\//i,
  /^axios\//i,
  /^got\//i,
  /^node-fetch/i,
  /^libwww-perl/i,
  /^lwp-trivial/i,
  /^curl\//i,
  /^wget\//i,
  /^httpie/i,
]

// Headers that only penetration testing / red-team tools tend to inject
const PENTEST_HEADER_PATTERNS = [
  'x-bug-bounty',
  'x-pentest',
  'x-penetration-test',
  'x-scan',
  'x-scanner',
  'x-security-test',
]

/**
 * Analyse HTTP headers for anomaly signals and return a partial entropy score.
 *
 * @param headers - The raw headers from the incoming request.
 * @param trustProxy - Whether the server trusts the X-Forwarded-For header.
 */
export function fingerprintHeaders(
  headers: Readonly<Record<string, string | string[] | undefined>>,
  trustProxy: boolean,
): FingerprintResult {
  const signals: string[] = []
  let score = 0

  const ua = typeof headers['user-agent'] === 'string' ? headers['user-agent'] : ''
  const accept = headers['accept']
  const acceptLang = headers['accept-language']

  // ── M1: Missing User-Agent ─────────────────────────────────────────────────
  if (!ua) {
    score += 0.15
    signals.push('missing user-agent')
  } else {
    // ── Scanner UA ───────────────────────────────────────────────────────────
    if (SCANNER_UA_PATTERNS.some(re => re.test(ua))) {
      score += 0.40
      signals.push('scanner user-agent detected')
    } else if (AUTOMATION_UA_PATTERNS.some(re => re.test(ua))) {
      score += 0.10
      signals.push('automation client detected')
    }
  }

  // ── M2: Missing Accept header (browsers always send this) ─────────────────
  if (!accept) {
    score += 0.08
    signals.push('missing accept header')
  }

  // ── M3: Missing Accept-Language (common in headless/script clients) ────────
  if (!acceptLang && !!ua) {
    // Only penalise if there IS a UA but no accept-language (bots often set UA)
    score += 0.05
    signals.push('missing accept-language with user-agent present')
  }

  // ── M4: XFF present without trustProxy (potential spoof probe) ────────────
  if (!trustProxy && headers['x-forwarded-for']) {
    score += 0.05
    signals.push('x-forwarded-for header present (trustProxy=false)')
  }

  // ── M5: Pentest / red-team headers ────────────────────────────────────────
  for (const h of PENTEST_HEADER_PATTERNS) {
    if (headers[h] !== undefined) {
      score += 0.30
      signals.push(`pentest header detected: ${h}`)
      break // one hit is enough
    }
  }

  // ── M6: Suspicious Accept-Encoding (only for very unusual values) ─────────
  const encoding = typeof headers['accept-encoding'] === 'string' ? headers['accept-encoding'] : ''
  if (encoding && !/gzip|deflate|br|zstd|identity|\*/.test(encoding)) {
    score += 0.05
    signals.push('unusual accept-encoding value')
  }

  // ── M7: Host header absent (HTTP/1.0 scanners or raw requests) ────────────
  if (!headers['host']) {
    score += 0.10
    signals.push('missing host header')
  }

  return { score: Math.min(score, 1.0), signals }
}
