import { describe, expect, it } from 'vitest'
import { buildNavEntries, emptyNavData, isGroup, itemActive, navLabelByPath, type NavData, type NavGroup, type NavItem, type NavViewer } from './nav-config'
import { statementDepts } from '@/lib/dept-statements'
import type { DeptRegistryRow } from '@/lib/dept-registry'
import { withActions } from '@/test/with-actions'

// 2026-10-09 — the user: 我要把每个 department 的 cash flow, P&L 放过来.
// For whoever reads every department and the reports company-wide, Dept Pool
// opens on its overview and lists each department, each with its own P&L and
// Cash Flow; whoever reaches the pool without the reports keeps the overview.
// (A department manager's Cash / Accrual P&L went with the kind, 2026-10-17.)

const extra = (name: string, segmentKey: string): DeptRegistryRow => ({
  id: segmentKey, name, segmentKey, poolGlCode: '1100', billingModeKey: `${segmentKey}_attribution`, isInternal: false,
})
const DATA: NavData = { ...emptyNavData, deptPoolDepts: statementDepts([extra('IT', 'it'), extra('Revenue Department', 'revenue_department')]) }

function deptPool(viewer: NavViewer, data: NavData = DATA): NavItem[] {
  const group = buildNavEntries(data).find((e): e is NavGroup => isGroup(e) && e.label === 'Dept Pool')
  if (!group) throw new Error('no Dept Pool group')
  return group.children.filter((c): c is NavItem => !isGroup(c) && c.visible(viewer))
}

const FINANCE = withActions({ role: 'finance', permissions: ['dept_pool', 'reports', 'dept_reports'] }) as NavViewer
const POOL_ONLY = withActions({ role: 'staff', permissions: ['dept_pool', 'dept_reports'] }) as NavViewer

describe('Dept Pool in the sidebar', () => {
  it('lists the overview, then each department, for whoever reads them all', () => {
    expect(deptPool(FINANCE).map((c) => [c.label, c.href])).toEqual([
      ['Overview', '/dept-pool'],
      ['Venture', '/dept-pool/statements/venture'],
      ['Marketing', '/dept-pool/statements/marketing'],
      ['Finance', '/dept-pool/statements/finance'],
      ['HR', '/dept-pool/statements/hr'],
      ['Director Office', '/dept-pool/statements/director-office'],
      ['IT', '/dept-pool/statements/it'],
      ['Revenue Department', '/dept-pool/statements/revenue-department'],
    ])
  })

  it('still lists the five before the registry has been read', () => {
    expect(deptPool(FINANCE, emptyNavData).map((c) => c.label)).toEqual(['Overview', 'Venture', 'Marketing', 'Finance', 'HR', 'Director Office'])
  })

  it('keeps the overview alone for whoever does not read the reports', () => {
    expect(deptPool(POOL_ONLY).map((c) => [c.label, c.href])).toEqual([['Overview', '/dept-pool']])
  })

  it('lights the overview on both bases and on the pages it opens', () => {
    const [overview] = deptPool(FINANCE)
    expect(itemActive(overview, '/dept-pool', null, null)).toBe(true)
    expect(itemActive(overview, '/dept-pool', null, 'accrual')).toBe(true)
    expect(itemActive(overview, '/dept-pool/submissions', null, null)).toBe(true)
    expect(itemActive(overview, '/dept-pool/contracts/new', null, null)).toBe(true)
    expect(itemActive(overview, '/dept-pool/statements/hr', null, null)).toBe(false)
  })

  it('lights a department on its statements, and on the pool page it already had', () => {
    const hr = deptPool(FINANCE).find((c) => c.label === 'HR') as NavItem
    expect(itemActive(hr, '/dept-pool/statements/hr', null, null)).toBe(true)
    expect(itemActive(hr, '/dept-pool/hr', null, null)).toBe(true)
    const marketing = deptPool(FINANCE).find((c) => c.label === 'Marketing') as NavItem
    expect(itemActive(marketing, '/dept-pool/marketing/contracts', null, null)).toBe(true)
    expect(itemActive(marketing, '/dept-pool/statements/hr', null, null)).toBe(false)
  })

  it('names a department’s page in the activity log', () => {
    expect(navLabelByPath(DATA).get('/dept-pool/statements/it')).toBe('Dept Pool · IT')
    expect(navLabelByPath(DATA).get('/dept-pool')).toBe('Dept Pool · Overview')
  })
})
