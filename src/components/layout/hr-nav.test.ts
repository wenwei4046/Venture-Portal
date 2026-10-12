import { describe, expect, it } from 'vitest'
import { withActions } from '@/test/with-actions'
import { activeHrNavKey, hrNavSections, revenueView, visibleHrNav } from './hr-nav'
import type { NavViewer } from './nav-config'

// HR's sidebar (2026-10-10, the HR revamp handoff): the five sections in the
// prototype's order, which page lights which row, and what drops out.

const hr = withActions({ id: 'h', role: 'hr', permissions: ['team', 'director_salary', 'director_pool', 'revenue', 'member_requests_manage', 'audit_log'] }) as unknown as NavViewer

describe("HR's sidebar", () => {
  it('lists the sections and rows in the user’s order (2026-10-12)', () => {
    const sections = visibleHrNav(hrNavSections('fair'), hr)
    expect(sections.map(s => [s.roman, s.label, s.items.map(i => i.label)])).toEqual([
      [null, null, ['Overview']],
      ['I.', 'HR & Payroll', ['HR Costing', 'Payroll', 'Payment']],
      ['II.', 'Revenue', ['Comm Cal', 'Sales Groups', 'Rules']],
      ['III.', 'People', ['People Management', 'Hierarchy', 'Member Services']],
      ['IV.', 'Admin', ['Audit Log']],
      ['V.', 'Directors', ['Director Salary', 'Director Pool']],
    ])
  })

  it('puts Hiring first and Directors last: Hiring, HR & Payroll, Revenue, People, Admin, Directors', () => {
    expect(hrNavSections('fair').map(s => s.label)).toEqual([null, 'Hiring', 'HR & Payroll', 'Revenue', 'People', 'Admin', 'Directors'])
  })

  it('opens Revenue on the sub-department it is handed', () => {
    const rev = hrNavSections('ir').find(s => s.label === 'Revenue')!
    expect(rev.items.map(i => i.href)).toEqual(['/revenue/ir', '/revenue/ir/hierarchy', '/revenue/ir/rules'])
  })

  it('drops a section nobody can open, and the numerals count what is left', () => {
    const noRevenue = withActions({ id: 'h', role: 'hr', permissions: ['team', 'audit_log'] }) as unknown as NavViewer
    const sections = visibleHrNav(hrNavSections('fair'), noRevenue)
    expect(sections.map(s => s.label)).not.toContain('Revenue')
    expect(sections.map(s => s.label)).not.toContain('Directors')
    expect(sections.find(s => s.label === 'Admin')?.roman).toBe('III.')
  })

  it('has no Revenue rows while there is no sub-department', () => {
    const sections = visibleHrNav(hrNavSections(null), hr)
    expect(sections.map(s => s.label)).not.toContain('Revenue')
  })

  it.each([
    ['/dashboard', 'overview'],
    ['/hr-costing', 'hrc'],
    ['/hr-costing/allocation', 'hrc'],
    ['/hr-costing/payroll/2026-09-01', 'pay'],
    ['/hr-costing/payment', 'pmt'],
    ['/director-pool', 'dpool'],
    ['/revenue/fair', 'cc'],
    ['/revenue/ir/2026-09-01/orders', 'cc'],
    ['/revenue/fair/hierarchy', 'sg'],
    ['/revenue/fair/rules', 'rules'],
    ['/team/people/abc', 'ppl'],
    ['/team/hierarchy', 'hier'],
    ['/member-admin', 'mem'],
    ['/audit-log/access', 'audit'],
    ['/claims', null],
    ['/revenue/department', null],
  ])('%s lights %s', (path, key) => {
    expect(activeHrNavKey(hrNavSections('fair'), path)).toBe(key)
  })

  it('reads which of Revenue’s three a path is', () => {
    expect(revenueView('/revenue')).toBe('cc')
    expect(revenueView('/revenue/fair/2026-09-01/import')).toBe('cc')
    expect(revenueView('/revenue/products')).toBeNull()
    expect(revenueView('/team/people')).toBeNull()
  })
})
