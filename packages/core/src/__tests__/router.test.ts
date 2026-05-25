import { describe, it, expect, beforeEach } from 'vitest'
import { Router } from '../router.js'
import type { Handler } from '../types.js'

const noopHandler: Handler = () => {}

describe('Router', () => {
  let router: Router

  beforeEach(() => {
    router = new Router()
  })

  describe('basic route matching', () => {
    it('matches a root route', () => {
      router.add('GET', '/', noopHandler)
      const match = router.find('GET', '/')
      expect(match).not.toBeNull()
      expect(match!.params).toEqual({})
    })

    it('matches a static route', () => {
      router.add('GET', '/users', noopHandler)
      expect(router.find('GET', '/users')).not.toBeNull()
      expect(router.find('GET', '/posts')).toBeNull()
    })

    it('matches a nested static route', () => {
      router.add('GET', '/api/v1/users', noopHandler)
      expect(router.find('GET', '/api/v1/users')).not.toBeNull()
      expect(router.find('GET', '/api/v2/users')).toBeNull()
    })

    it('matches different HTTP methods independently', () => {
      router.add('GET', '/users', noopHandler)
      router.add('POST', '/users', noopHandler)
      expect(router.find('GET', '/users')).not.toBeNull()
      expect(router.find('POST', '/users')).not.toBeNull()
      expect(router.find('DELETE', '/users')).toBeNull()
    })

    it('returns null for unknown routes', () => {
      expect(router.find('GET', '/unknown')).toBeNull()
    })

    it('ignores trailing slashes', () => {
      router.add('GET', '/users', noopHandler)
      expect(router.find('GET', '/users/')).not.toBeNull()
    })
  })

  describe('param routes', () => {
    it('matches a param route and extracts the param', () => {
      router.add('GET', '/users/:id', noopHandler)
      const match = router.find('GET', '/users/123')
      expect(match).not.toBeNull()
      expect(match!.params).toEqual({ id: '123' })
    })

    it('matches multiple params', () => {
      router.add('GET', '/orgs/:orgId/users/:userId', noopHandler)
      const match = router.find('GET', '/orgs/acme/users/42')
      expect(match).not.toBeNull()
      expect(match!.params).toEqual({ orgId: 'acme', userId: '42' })
    })

    it('URL-decodes param values', () => {
      router.add('GET', '/files/:name', noopHandler)
      const match = router.find('GET', '/files/hello%20world')
      expect(match!.params).toEqual({ name: 'hello world' })
    })

    it('does not match when segment count differs', () => {
      router.add('GET', '/users/:id', noopHandler)
      expect(router.find('GET', '/users')).toBeNull()
      expect(router.find('GET', '/users/123/posts')).toBeNull()
    })

    it('prefers exact matches over param routes', () => {
      const exactHandler: Handler = () => 'exact'
      const paramHandler: Handler = () => 'param'
      router.add('GET', '/users/me', exactHandler)
      router.add('GET', '/users/:id', paramHandler)
      const match = router.find('GET', '/users/me')
      expect(match!.route.handler).toBe(exactHandler)
    })
  })

  describe('wildcard routes', () => {
    it('matches a wildcard route', () => {
      router.add('GET', '/files/*', noopHandler)
      const match = router.find('GET', '/files/a/b/c')
      expect(match).not.toBeNull()
      expect(match!.params['*']).toBe('a/b/c')
    })

    it('matches a single-segment wildcard', () => {
      router.add('GET', '/files/*', noopHandler)
      const match = router.find('GET', '/files/readme.txt')
      expect(match!.params['*']).toBe('readme.txt')
    })
  })

  describe('getAllowedMethods', () => {
    it('returns allowed methods for a known path', () => {
      router.add('GET', '/users', noopHandler)
      router.add('POST', '/users', noopHandler)
      const methods = router.getAllowedMethods('/users')
      expect(methods).toContain('GET')
      expect(methods).toContain('POST')
      expect(methods).not.toContain('DELETE')
    })

    it('returns empty for unknown path', () => {
      expect(router.getAllowedMethods('/unknown')).toEqual([])
    })
  })

  describe('getRoutes', () => {
    it('returns all registered routes', () => {
      router.add('GET', '/a', noopHandler)
      router.add('POST', '/b', noopHandler)
      expect(router.getRoutes()).toHaveLength(2)
    })

    it('stores the correct handler', () => {
      router.add('GET', '/a', noopHandler)
      const [route] = router.getRoutes()
      expect(route!.handler).toBe(noopHandler)
    })
  })
})
