import { describe, expect, it } from 'vitest'
import { withActions } from '@/test/with-actions'
import { activeHrNavKey, hrNavSections, revenueView, visibleHrNav } from './hr-nav'
import type { NavViewer } from './nav-config'

// HR's sidebar (2026-10-15, the Attendance handoff's README › Sidebar — final
// order): the eight sections, which page (and which tab of it) lights which
// row, and what drops out.

const hr = withActions({ id: 'h', role: 'hr', permissions: ['team', 'director_salary', 'director_pool', 'revenue', 'member_requests_manage', 'audit_log', 'attendance'] }) as unknown as NavViewer
const q = (s: string) => new URLSearchParams(s)

describe("HR's sidebar", () => {
  it('lists the sections and rows in the handoff’s order', () => {
    const sections = visibleHrNav(hrNavSections('fair'), hr)
    expect(sections.map(s => [s.roman, s.label, s.items.map(i => i.label)])).toEqual([
      [null, null, ['Overview']],
      ['I.', 'Attendance', ['Today', 'Records', 'Requests', 'Leave balances', 'Month close', 'Settings', 'Readiness']],
      ['II.', 'HR & Payroll', ['HR Costing', 'Payroll', 'Allocation', 'Payment']],
      ['III.', 'Revenue', ['Comm Cal', 'Sales chart', 'Members', 'Waiting list', 'Replacement list', 'Rules', 'Requests', 'Brand weeks', 'Transport claim', 'Food claim']],
      ['IV.', 'People Management', ['People', 'Permissions', 'Org chart', 'People & roles', 'Levels']],
      ['V.', 'Admin', ['Audit Log', 'IT support']],
      ['VI.', 'Directors', ['Director Salary', 'Director Pool']],
    ])
  })

  it('keeps the handoff’s eight sections: Hiring, Attendance, HR & Payroll, Revenue, People Management, Documentation, Admin, Directors', () => {
    expect(hrNavSections('fair').map(s => s.label)).toEqual([null, 'Hiring', 'Attendance', 'HR & Payroll', 'Revenue', 'People Management', 'Documentation', 'Admin', 'Directors'])
  })

  it('opens own IT support without a module permission, except while viewing as somebody', () => {
    const own = { ...hr, permissions: [], actions: {}, tabs: [] }
    const items = (viewer: NavViewer) => visibleHrNav(hrNavSections(null), viewer).flatMap(s => s.items)
    expect(items(own).find(i => i.key === 'it-support')?.href).toBe('/it-support')
    expect(items({ ...own, viewingAs: { id: 'other', name: 'Other' } }).map(i => i.key)).not.toContain('it-support')
  })

  it('opens Revenue on the sub-department it is handed, each Sales Groups tab its own row', () => {
    const rev = hrNavSections('ir').find(s => s.label === 'Revenue')!
    expect(rev.items.slice(0, 6).map(i => i.href)).toEqual([
      '/revenue/ir', '/revenue/ir/hierarchy', '/revenue/ir/hierarchy?tab=members', '/revenue/ir/hierarchy?tab=waiting',
      '/revenue/ir/hierarchy?tab=replacement', '/revenue/ir/rules',
    ])
  })

  it('drops a section nobody can open, and the numerals count what is left', () => {
    const noRevenue = withActions({ id: 'h', role: 'hr', permissions: ['team', 'audit_log'] }) as unknown as NavViewer
    const sections = visibleHrNav(hrNavSections('fair'), noRevenue)
    expect(sections.map(s => s.label)).not.toContain('Revenue')
    expect(sections.map(s => s.label)).not.toContain('Attendance')
    expect(sections.map(s => s.label)).not.toContain('Directors')
    expect(sections.find(s => s.label === 'Admin')?.roman).toBe('III.')
  })

  // Sub-departments per person (2026-10-16): each Revenue page opens one the viewer reaches there; none, no rows.
  it('opens each Revenue page on its own sub-department, and leaves out a page with none', () => {
    const rev = visibleHrNav(hrNavSections({ cc: 'fair', sg: 'ir', rules: null }), hr).find(s => s.label === 'Revenue')!
    expect(rev.items.map(i => [i.label, i.href])).toEqual([
      ['Comm Cal', '/revenue/fair'],
      ['Sales chart', '/revenue/ir/hierarchy'],
      ['Members', '/revenue/ir/hierarchy?tab=members'],
      ['Waiting list', '/revenue/ir/hierarchy?tab=waiting'],
      ['Replacement list', '/revenue/ir/hierarchy?tab=replacement'],
      ['Requests', '/member-admin'],
      ['Brand weeks', '/member-admin?tab=weeks'],
      ['Transport claim', '/member-admin?tab=claims'],
      ['Food claim', '/member-admin?tab=food'],
    ])
  })

  it('has no Revenue rows while there is no sub-department, but Member Services’ rows stay', () => {
    const rev = visibleHrNav(hrNavSections(null), hr).find(s => s.label === 'Revenue')!
    expect(rev.items.map(i => i.label)).toEqual(['Requests', 'Brand weeks', 'Transport claim', 'Food claim'])
  })

  it.each([
    ['/dashboard', '', 'overview'],
    ['/attendance/today', '', 'today'],
    ['/attendance/records', 'm=2026-09', 'records'],
    ['/attendance/readiness', '', 'ready'],
    ['/hr-costing', '', 'hrc'],
    ['/hr-costing/allocation', '', 'payAlloc'],
    ['/hr-costing/allocation/2026-09-01', '', 'payAlloc'],
    ['/hr-costing/payroll/2026-09-01', '', 'pay'],
    ['/hr-costing/payment', '', 'pmt'],
    ['/director-pool', '', 'dpool'],
    ['/revenue/fair', '', 'cc'],
    ['/revenue/ir/2026-09-01/orders', '', 'cc'],
    ['/revenue/fair/hierarchy', '', 'sgChart'],
    ['/revenue/fair/hierarchy', 'tab=waiting', 'sgWait'],
    ['/revenue/fair/hierarchy', 'tab=nonsense', 'sgChart'],
    ['/revenue/fair/rules', '', 'rules'],
    ['/team/people/abc', '', 'pplPeople'],
    ['/team/people', 'tab=permissions', 'pplPerm'],
    ['/team/hierarchy', '', 'hierChart'],
    ['/team/hierarchy', 'tab=levels', 'hierLevels'],
    ['/team/hierarchy', 'tab=table', 'hierRoles'],
    ['/team/roles', '', 'hierRoles'],
    ['/member-admin', '', 'memReq'],
    ['/member-admin', 'tab=food', 'memFood'],
    ['/team/documentation', 'tab=letters', 'docLetters'],
    ['/admin/rooms', 'tab=rooms', 'roomRooms'],
    ['/admin/rooms', '', 'roomSched'],
    ['/audit-log/access', '', 'audit'],
    ['/it-support', '', 'it-support'],
    ['/claims', '', null],
    ['/revenue/department', '', null],
  ])('%s?%s lights %s', (path, search, key) => {
    expect(activeHrNavKey(hrNavSections('fair'), path, q(search))).toBe(key)
  })

  it('reads which of Revenue’s three a path is', () => {
    expect(revenueView('/revenue')).toBe('cc')
    expect(revenueView('/revenue/fair/2026-09-01/import')).toBe('cc')
    expect(revenueView('/revenue/products')).toBeNull()
    expect(revenueView('/team/people')).toBeNull()
  })
})
