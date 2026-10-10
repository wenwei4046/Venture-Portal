import { describe, expect, it } from 'vitest'
import { buildNavEntries, isGroup, navLabelByPath, navRootPaths, withPathRevenueSub, type NavData, type NavGroup } from './nav-config'

// 2026-10-10 (the HR revamp handoff): Fair | IR left the sidebar for a
// switcher on each Revenue page's head, so the Revenue group lists Comm Cal /
// Sales Groups (was Staff Hierarchy) / Rules of ONE sub-department — the one
// last picked, or the page's own while a Revenue page is open.

const data: NavData = {
  revenueSubDepts: [
    { slug: 'fair', name: 'Fair' },
    { slug: 'ir', name: 'IR' },
  ],
  revenueSub: 'fair',
}

function revenueGroup(d: NavData): NavGroup {
  const g = buildNavEntries(d).find(e => isGroup(e) && e.label === 'Revenue')
  if (!g || !isGroup(g)) throw new Error('no Revenue group')
  return g
}

describe('the Revenue group', () => {
  it('lists one sub-department’s three views, flat, then Department', () => {
    const g = revenueGroup(data)
    expect(g.children.map(c => [c.label, 'href' in c ? c.href : null])).toEqual([
      ['Comm Cal', '/revenue/fair'],
      ['Sales Groups', '/revenue/fair/hierarchy'],
      ['Rules', '/revenue/fair/rules'],
      ['Department', '/revenue/department'],
    ])
  })

  it('follows the Revenue page being read', () => {
    expect(withPathRevenueSub(data, '/revenue/ir/rules').revenueSub).toBe('ir')
    expect(withPathRevenueSub(data, '/revenue/nope').revenueSub).toBe('fair')
    expect(withPathRevenueSub(data, '/team/people')).toBe(data)
  })

  it('still counts every sub-department’s views as tabs and names them', () => {
    const roots = navRootPaths(data)
    expect(roots.has('/revenue/ir/hierarchy')).toBe(true)
    const labels = navLabelByPath(data)
    expect(labels.get('/revenue/ir/rules')).toBe('Revenue · IR · Rules')
    expect(labels.get('/revenue/fair')).toBe('Revenue · Fair')
    expect(labels.get('/revenue/fair/hierarchy')).toBe('Revenue · Fair · Sales Groups')
  })
})
