import { describe, it, expect } from 'vitest'
import { renderDashboard } from '../html.js'

describe('renderDashboard', () => {
  it('renders valid HTML with route table', () => {
    const html = renderDashboard([], '/kairo')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('KAIRO')
    expect(html).toContain('/kairo/events')
  })

  it('escapes HTML in route paths', () => {
    const routes = [{
      method: 'GET' as const,
      path: '/users/<b>xss</b>',
      handler: async () => {},
      middleware: [],
      options: { risk: 'low' as const },
    }]
    const html = renderDashboard(routes, '/kairo')
    // The raw tags must not appear unescaped in the table body
    expect(html).not.toContain('/users/<b>')
    expect(html).toContain('&lt;b&gt;xss&lt;/b&gt;')
  })

  it('shows route count in header', () => {
    const routes = [
      { method: 'GET' as const, path: '/a', handler: async () => {}, middleware: [], options: {} },
      { method: 'POST' as const, path: '/b', handler: async () => {}, middleware: [], options: {} },
    ]
    const html = renderDashboard(routes, '/kairo')
    expect(html).toContain('Routes (2)')
  })
})
