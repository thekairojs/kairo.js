// PII detection patterns for response scanning

export interface PiiMatch {
  field: string
  pattern: string
  sample: string  // first 4 chars only — never log the full value
}

// Each entry: [name, regex]
const PATTERNS: [string, RegExp][] = [
  ['email',          /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g],
  ['credit-card',    /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g],
  ['ssn',            /\b\d{3}-\d{2}-\d{4}\b/g],
  ['phone-us',       /\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g],
  ['ipv4-private',   /\b(?:10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b/g],
  ['aws-key',        /AKIA[0-9A-Z]{16}/g],
  ['jwt',            /eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g],
]

export function scanForPii(obj: unknown, prefix = ''): PiiMatch[] {
  const matches: PiiMatch[] = []
  _scan(obj, prefix, matches, new Set<object>())
  return matches
}

function _scan(val: unknown, path: string, out: PiiMatch[], visited: Set<object>): void {
  if (val === null || val === undefined) return

  if (typeof val === 'string') {
    for (const [name, re] of PATTERNS) {
      re.lastIndex = 0
      const m = re.exec(val)
      if (m) {
        out.push({ field: path, pattern: name, sample: m[0].slice(0, 4) })
      }
    }
    return
  }

  if (typeof val !== 'object') return
  if (visited.has(val as object)) return
  visited.add(val as object)

  if (Array.isArray(val)) {
    ;(val as unknown[]).forEach((item, i) => _scan(item, `${path}[${i}]`, out, visited))
    return
  }

  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    _scan(v, path ? `${path}.${k}` : k, out, visited)
  }
}
