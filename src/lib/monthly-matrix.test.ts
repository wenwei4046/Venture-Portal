import { describe, it, expect } from 'vitest'
import { buildHierarchyRows, type HierAccount } from './monthly-matrix'

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
