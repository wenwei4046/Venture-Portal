import { describe, it, expect } from 'vitest'
import {
  columnTotals,
  comparePayrollOrder,
  dirtyFields,
  editFromRow,
  formatAmount,
  groupByDepartment,
  neighbourId,
  NO_DEPARTMENT,
  parseAmount,
  periodLabel,
  PAYROLL_EDIT_FIELDS,
} from './payroll-grid'

const saved = {
  basic_salary: 3000,
  statutory_allowance: 0,
  non_statutory_allowance: 127,
  ot_hours: 0,
  ot_amount: 0,
  commission_amount: 0,
  unpaid_leave_days: 0,
  deduction_amount: 0,
  skbbk_amount: 22.15,
}

describe('editFromRow', () => {
  it('copies the nine editable figures as numbers', () => {
    const edit = editFromRow({ ...saved, basic_salary: '3000' as unknown as number })
    expect(edit.basic_salary).toBe(3000)
    expect(Object.keys(edit).sort()).toEqual([...PAYROLL_EDIT_FIELDS].sort())
  })

  it('treats null and garbage as zero rather than NaN', () => {
    const edit = editFromRow({ basic_salary: null, ot_amount: 'x' as unknown as number })
    expect(edit.basic_salary).toBe(0)
    expect(edit.ot_amount).toBe(0)
    expect(edit.skbbk_amount).toBe(0)
  })
})

describe('dirtyFields', () => {
  it('is empty when nothing moved, including float noise', () => {
    const edit = editFromRow({ ...saved, skbbk_amount: 22.15 + 1e-12 })
    expect(dirtyFields(edit, saved)).toEqual([])
  })

  it('lists exactly the fields that changed', () => {
    const edit = editFromRow({ ...saved, ot_amount: 120, unpaid_leave_days: 1 })
    expect(dirtyFields(edit, saved)).toEqual(['ot_amount', 'unpaid_leave_days'])
  })

  it('ignores commission on a derived row — the run owns that figure', () => {
    const edit = editFromRow({ ...saved, commission_amount: 4250 })
    expect(dirtyFields(edit, saved, { commissionDerived: true })).toEqual([])
    expect(dirtyFields(edit, saved, { commissionDerived: false })).toEqual(['commission_amount'])
  })
})

describe('groupByDepartment', () => {
  const rows = [
    { id: 'a', dept_name: 'Marketing', staff_name: 'THIEN YEE MUN', gross: 3500, net: 3090.5 },
    { id: 'b', dept_name: 'Finance', staff_name: 'NUR AIN', gross: 3127, net: 2753.85 },
    { id: 'c', dept_name: '—', staff_name: 'ZED', gross: 100, net: 90 },
    { id: 'd', dept_name: 'Finance', staff_name: 'LOW CHENG AN', gross: 3800, net: 3352.15 },
    { id: 'e', dept_name: '', staff_name: 'ANON', gross: 10.005, net: 9.995 },
  ]

  it('orders departments A→Z with the department-less last, names A→Z inside', () => {
    const groups = groupByDepartment(rows)
    expect(groups.map(g => g.dept)).toEqual(['Finance', 'Marketing', NO_DEPARTMENT])
    expect(groups[0].rows.map(r => r.id)).toEqual(['d', 'b'])
    expect(groups[2].rows.map(r => r.id)).toEqual(['e', 'c'])
  })

  it('carries a Gross / Net subtotal per department, rounded to cents', () => {
    const groups = groupByDepartment(rows)
    expect(groups[0].gross).toBe(6927)
    expect(groups[0].net).toBe(6106)
    expect(groups[2].gross).toBe(110.01)
    expect(groups[2].net).toBe(100)
  })

  it('does not mutate the input order', () => {
    const copy = rows.map(r => r.id)
    groupByDepartment(rows)
    expect(rows.map(r => r.id)).toEqual(copy)
  })
})

describe('comparePayrollOrder', () => {
  // Billing Allocation lists the same people as the grid, and must read in
  // the same order for the two to be checked against each other (2026-09-30).
  it('sorts a flat list exactly as the grid reads its groups', () => {
    const rows = [
      { id: 'a', dept_name: 'Marketing', staff_name: 'THIEN YEE MUN', gross: 0, net: 0 },
      { id: 'b', dept_name: 'Finance', staff_name: 'NUR AIN', gross: 0, net: 0 },
      { id: 'c', dept_name: '—', staff_name: 'ZED', gross: 0, net: 0 },
      { id: 'd', dept_name: 'Finance', staff_name: 'LOW CHENG AN', gross: 0, net: 0 },
      { id: 'e', dept_name: '', staff_name: 'ANON', gross: 0, net: 0 },
      { id: 'f', dept_name: 'Director Office', staff_name: 'CHOW WAI MAN', gross: 0, net: 0 },
    ]
    const grid = groupByDepartment(rows).flatMap(g => g.rows.map(r => r.id))
    expect([...rows].sort(comparePayrollOrder).map(r => r.id)).toEqual(grid)
    expect(grid).toEqual(['f', 'd', 'b', 'a', 'e', 'c'])
  })
})

describe('columnTotals', () => {
  it('sums the asked-for columns and rounds to cents', () => {
    const rows = [
      { gross: 0.1, net: 1 },
      { gross: 0.2, net: 2 },
    ]
    expect(columnTotals(rows, ['gross', 'net'])).toEqual({ gross: 0.3, net: 3 })
  })
})

describe('parseAmount', () => {
  it('reads formatted money back into a number', () => {
    expect(parseAmount('3,000.00')).toBe(3000)
    expect(parseAmount('RM 1,200.5')).toBe(1200.5)
    expect(parseAmount(' 22.15 ')).toBe(22.15)
  })

  it('treats an empty field as zero', () => {
    expect(parseAmount('')).toBe(0)
    expect(parseAmount('.')).toBe(0)
  })

  it('rejects letters and negatives with null so the field keeps its last value', () => {
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount('-50')).toBeNull()
    expect(parseAmount('1.2.3')).toBeNull()
  })
})

describe('formatAmount', () => {
  it('groups thousands and fixes the decimals', () => {
    expect(formatAmount(3000)).toBe('3,000.00')
    expect(formatAmount(0.5, 1)).toBe('0.5')
    expect(formatAmount(Number.NaN)).toBe('0.00')
  })
})

describe('neighbourId', () => {
  const order = ['a', 'b', 'c']
  it('steps through the display order and stops at both ends', () => {
    expect(neighbourId(order, 'b', -1)).toBe('a')
    expect(neighbourId(order, 'b', 1)).toBe('c')
    expect(neighbourId(order, 'a', -1)).toBeNull()
    expect(neighbourId(order, 'c', 1)).toBeNull()
    expect(neighbourId(order, 'zz', 1)).toBeNull()
  })
})

describe('periodLabel', () => {
  it('names the month without slipping across a timezone', () => {
    expect(periodLabel('2026-08-01')).toBe('August 2026')
    expect(periodLabel('2026-01-01')).toBe('January 2026')
  })
})
