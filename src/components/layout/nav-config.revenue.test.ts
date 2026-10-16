import { describe, expect, it } from 'vitest'
import { buildNavEntries, isGroup, navLabelByPath, navRootPaths, revenueNavData, revenueSubsOf, withPathRevenueSub, type NavData, type NavGroup } from './nav-config'
import { NO_REACH } from '@/lib/sub-department-reach'

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

// Sub-departments per person (2026-10-16 — the owner: "follow by this handle department, as default", ticked by
// sub-department per tab): each Revenue page opens a sub-department the viewer reaches there.
describe('each Revenue page follows the viewer’s reach', () => {
  const SUBS = [
    { id: 'id-fair', slug: 'fair', name: 'Fair', isHome: true },
    { id: 'id-ir', slug: 'ir', name: 'IR', isHome: false },
  ]
  // Comm Cal both, Sales Groups IR only, Rules none — and the CRM, which the sidebar does not draw.
  const reach = { ...NO_REACH, crm: ['id-ir'], comm_cal: ['id-fair', 'id-ir'], sales_groups: ['id-ir'] }

  it('picks per page: the one last picked where it reaches it, else home, else the first; none leaves the link out', () => {
    const nav = revenueNavData(SUBS, reach, 'fair')
    expect(nav.revenueSubDepts).toEqual([{ slug: 'fair', name: 'Fair' }, { slug: 'ir', name: 'IR' }])
    expect(nav.revenueSub).toBe('fair')
    expect(nav.revenueSubFor).toEqual({ cc: 'fair', sg: 'ir', rules: null })
    const g = revenueGroup({ ...data, ...nav })
    expect(g.children.map(c => [c.label, 'href' in c ? c.href : null])).toEqual([
      ['Comm Cal', '/revenue/fair'],
      ['Sales Groups', '/revenue/ir/hierarchy'],
      ['Department', '/revenue/department'],
    ])
  })

  it('a reach with nothing in the three pages lists no sub-department', () => {
    const nav = revenueNavData(SUBS, { ...NO_REACH, crm: ['id-ir'] }, undefined)
    expect(nav.revenueSubDepts).toEqual([])
    expect(nav.revenueSub).toBeNull()
    expect(nav.revenueSubFor).toEqual({ cc: null, sg: null, rules: null })
  })

  it('without a reach (a value built before it), every page opens the one sub-department, as before', () => {
    const nav = revenueNavData(SUBS, undefined, 'ir')
    expect(nav.revenueSubFor).toEqual({ cc: 'ir', sg: 'ir', rules: 'ir' })
    expect(revenueSubsOf({ revenueSub: 'fair' })).toEqual({ cc: 'fair', sg: 'fair', rules: 'fair' })
  })

  it('a Revenue page moves only the links that reach its sub-department', () => {
    const nav = { ...data, ...revenueNavData(SUBS, reach, 'fair') }
    const onIr = withPathRevenueSub(nav, '/revenue/ir/2026-09-01')
    expect(onIr.revenueSub).toBe('ir')
    expect(onIr.revenueSubFor).toEqual({ cc: 'ir', sg: 'ir', rules: null })
    const onFair = withPathRevenueSub({ ...nav, revenueSubFor: { cc: 'ir', sg: 'ir', rules: null }, revenueSub: 'ir' }, '/revenue/fair')
    expect(onFair.revenueSubFor).toEqual({ cc: 'fair', sg: 'ir', rules: null })
    expect(withPathRevenueSub(nav, '/revenue/fair')).toBe(nav)
  })
})
