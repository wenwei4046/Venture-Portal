import { describe, it, expect } from 'vitest'
import { buildHierarchyRows, monthColumns, type HierAccount } from './monthly-matrix'

const acc = (
  code: string,
  name: string,
  values: number[],
  ancestry: { code: string; name: string }[] = [],
): HierAccount => ({ code, name, values, ancestry })

describe('buildHierarchyRows', () => {
  it('rolls children up under their COA parent with a summed parent row', () => {
    const parent = { code: '9080', name: 'Staff Salary & Contribution' }
    const rows = buildHierarchyRows(
      [
        acc('9081', 'EPF Contribution', [-100], [parent]),
        acc('9030', 'Salary Expense', [-900], [parent]),
      ],
      'expense',
      1,
    )
    // parent header first (depth 1, isParent, summed), then children A→Z at depth 2
    expect(rows.map((r) => [r.label, r.depth, r.kind, r.isParent ?? false, r.values[0]])).toEqual([
      ['Staff Salary & Contribution', 1, 'account', true, -1000],
      ['EPF Contribution', 2, 'account', false, -100],
      ['Salary Expense', 2, 'account', false, -900],
    ])
  })

  // 2026-09-28: the P&L showed "Discount Allowed" (5999) at the top of Revenue
  // because D sorts before S, and re-ordering it in Edit layout did nothing.
  // The layout's order now wins; anything it does not list follows, A→Z.
  it('follows the layout order first, then A→Z for what it does not list', () => {
    const smc = { code: '5030', name: 'Service Management Charge' }
    const rows = buildHierarchyRows(
      [
        acc('5999', 'Discount Allowed', [-500]),
        acc('5050', 'Salary Income', [16886.92]),
        acc('5016', 'Commission Income', [37747.71], [smc]),
        acc('5012', 'Revenue - Lead Gen', [87500], [smc]),
        acc('5060', 'Other Income', [120]),
      ],
      'revenue',
      1,
      // Layout: the group first (via one of its children), then salary, then
      // the discount last. 5060 is unlisted.
      ['5012', '5016', '5050', '5999'],
    )
    expect(rows.map((r) => r.label)).toEqual([
      'Service Management Charge',
      'Revenue - Lead Gen',
      'Commission Income',
      'Salary Income',
      'Discount Allowed',
      'Other Income',
    ])
  })

  it('without a layout order it still sorts A→Z', () => {
    const rows = buildHierarchyRows(
      [acc('5999', 'Discount Allowed', [-500]), acc('5050', 'Salary Income', [10])],
      'revenue',
      1,
    )
    expect(rows.map((r) => r.label)).toEqual(['Discount Allowed', 'Salary Income'])
  })

  it('sorts A→Z by name within each level', () => {
    const rows = buildHierarchyRows(
      [acc('1', 'Zebra', [1]), acc('2', 'Apple', [1]), acc('3', 'Mango', [1])],
      'cat',
      1,
    )
    expect(rows.map((r) => r.label)).toEqual(['Apple', 'Mango', 'Zebra'])
  })

  it('keeps standalone leaves (no ancestry) flat at the base depth', () => {
    const rows = buildHierarchyRows([acc('9085', 'Staff Refreshment', [-50])], 'expense', 1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ label: 'Staff Refreshment', depth: 1, kind: 'account', values: [-50] })
    expect(rows[0].isParent).toBeUndefined()
  })

  it('returns nothing for an empty account list', () => {
    expect(buildHierarchyRows([], 'cat', 1)).toEqual([])
  })
})

// 2026-10-25 — a department's "12 months" runs Nov – Oct: a From before January starts the months there.
describe('monthColumns', () => {
  it('lays out Accumulated, then January to To, latest first', () => {
    const { months, columns, accPeriod } = monthColumns(2026, 3)
    expect(months).toEqual(['2026-03', '2026-02', '2026-01'])
    expect(columns.map((c) => c.label)).toEqual(['Accumulated', 'Mar 2026', 'Feb 2026', 'Jan 2026'])
    expect(accPeriod).toEqual({ from: '2026-01-01', to: '2026-03-31' })
  })

  it('reaches back across the year from a From before January', () => {
    const { months, accPeriod } = monthColumns(2026, 2, '2025-11')
    expect(months).toEqual(['2026-02', '2026-01', '2025-12', '2025-11'])
    expect(accPeriod).toEqual({ from: '2025-11-01', to: '2026-02-28' })
  })

  it('leaves a From within the year to the page’s own cut', () => {
    expect(monthColumns(2026, 3, '2026-02').months).toEqual(['2026-03', '2026-02', '2026-01'])
  })
})
