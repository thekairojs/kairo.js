import type { HttpMethod, Handler, Middleware, RouteOptions, RouteDefinition } from './types.js'

interface RadixNode {
  segment: string
  children: Map<string, RadixNode>
  paramChild: RadixNode | null
  wildcardChild: RadixNode | null
  handlers: Map<HttpMethod, StoredRoute>
}

interface StoredRoute {
  handler: Handler
  middleware: Middleware[]
  options: Partial<RouteOptions>
  // C3: each stored route carries its own ordered list of param names
  paramNames: string[]
}

export interface MatchResult {
  route: StoredRoute
  params: Record<string, string>
}

function createNode(segment: string): RadixNode {
  return {
    segment,
    children: new Map(),
    paramChild: null,
    wildcardChild: null,
    handlers: new Map(),
  }
}

export class Router {
  private readonly root: RadixNode = createNode('')
  private readonly routes: RouteDefinition[] = []

  add(
    method: HttpMethod,
    path: string,
    handler: Handler,
    middleware: Middleware[] = [],
    options: Partial<RouteOptions> = {},
  ): void {
    const normalizedPath = this.normalizePath(path)
    const segments = normalizedPath === '/' ? [''] : normalizedPath.split('/').slice(1)

    let current = this.root
    // C3: collect param names in order for THIS route
    const paramNames: string[] = []

    for (const segment of segments) {
      if (segment === '*') {
        if (!current.wildcardChild) {
          current.wildcardChild = createNode('*')
        }
        current = current.wildcardChild
      } else if (segment.startsWith(':')) {
        const paramName = segment.slice(1)
        // C3: record param name for this route; do NOT store on node
        paramNames.push(paramName)
        if (!current.paramChild) {
          current.paramChild = createNode(':param')
        }
        current = current.paramChild
      } else {
        let child = current.children.get(segment)
        if (!child) {
          child = createNode(segment)
          current.children.set(segment, child)
        }
        current = child
      }
    }

    // C3: store paramNames alongside handler so sibling routes keep separate names
    current.handlers.set(method, { handler, middleware, options, paramNames })

    this.routes.push({
      method,
      path: normalizedPath,
      handler,
      middleware,
      options,
    })
  }

  find(method: HttpMethod, path: string): MatchResult | null {
    const normalizedPath = this.normalizePath(path)
    const segments = normalizedPath === '/' ? [''] : normalizedPath.split('/').slice(1)

    // C3: collect param values in order during traversal
    const paramValues: string[] = []

    const resultNode = this.matchNode(this.root, segments, 0, paramValues)
    if (!resultNode) return null

    const route = resultNode.handlers.get(method)
    if (!route) return null

    // C3: zip param values with route-specific param names
    const params: Record<string, string> = {}
    for (let i = 0; i < route.paramNames.length; i++) {
      const name = route.paramNames[i]
      const value = paramValues[i]
      if (name !== undefined && value !== undefined) {
        params[name] = value
      }
    }

    // Wildcard is stored in paramValues under a special sentinel
    const wildcardIdx = route.paramNames.indexOf('*')
    if (wildcardIdx === -1) {
      // Check if paramValues has a trailing wildcard value appended by matchNode
      const wildcardValue = (resultNode as RadixNode & { _wildcardValue?: string })._wildcardValue
      if (wildcardValue !== undefined) {
        params['*'] = wildcardValue
      }
    }

    return { route, params }
  }

  getAllowedMethods(path: string): HttpMethod[] {
    const normalizedPath = this.normalizePath(path)
    const segments = normalizedPath === '/' ? [''] : normalizedPath.split('/').slice(1)
    const paramValues: string[] = []

    const node = this.matchNode(this.root, segments, 0, paramValues)
    if (!node) return []

    return Array.from(node.handlers.keys())
  }

  getRoutes(): readonly RouteDefinition[] {
    return this.routes
  }

  private matchNode(
    node: RadixNode,
    segments: string[],
    index: number,
    paramValues: string[],
  ): RadixNode | null {
    if (index === segments.length) {
      return node.handlers.size > 0 ? node : null
    }

    const segment = segments[index]!

    // 1. Exact match (highest priority)
    const exactChild = node.children.get(segment)
    if (exactChild) {
      const result = this.matchNode(exactChild, segments, index + 1, paramValues)
      if (result) return result
    }

    // 2. Param match
    if (node.paramChild) {
      // C3: push param value in order; backtrack if this path doesn't match
      let decoded: string
      try { decoded = decodeURIComponent(segment) } catch { decoded = segment }
      paramValues.push(decoded)
      const result = this.matchNode(node.paramChild, segments, index + 1, paramValues)
      if (result) return result
      // Backtrack
      paramValues.pop()
    }

    // 3. Wildcard match (lowest priority, consumes rest)
    if (node.wildcardChild) {
      if (node.wildcardChild.handlers.size > 0) {
        // Store wildcard value on node temporarily (single-threaded, safe)
        ;(node.wildcardChild as RadixNode & { _wildcardValue?: string })._wildcardValue =
          segments.slice(index).map(s => { try { return decodeURIComponent(s) } catch { return s } }).join('/')
        return node.wildcardChild
      }
      return null
    }

    return null
  }

  private normalizePath(path: string): string {
    // L4: use local variable instead of reassigning parameter
    let normalized = path.startsWith('/') ? path : '/' + path
    if (normalized.length > 1 && normalized.endsWith('/')) normalized = normalized.slice(0, -1)
    return normalized
  }
}
