/**
 * Minimal route pattern matching.
 *
 * Patterns:
 *  - Exact: '/users'        → matches only '/users'
 *  - Wildcard suffix: '/users/*'  → matches '/users/123', '/users/abc/nested'
 *  - Any: '/*' or '*'      → matches everything
 */
export function matchesPattern(pattern: string, path: string): boolean {
  if (pattern === '*' || pattern === '/*') return true
  if (pattern === path) return true

  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2)
    return path === prefix || path.startsWith(prefix + '/')
  }

  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1)
    return path.startsWith(prefix)
  }

  return false
}

export function routeAllowed(allowedPatterns: string[], path: string): boolean {
  return allowedPatterns.some(p => matchesPattern(p, path))
}
