import { describe, it, expect } from 'vitest'
import {
  columnTotals,
  dirtyFields,
  editFromRow,
  formatAmount,
  groupByDepartment,
  neighbourId,
  NO_DEPARTMENT,
  parseAmount,
  payrollRowWrite,
  periodLabel,
  PAYROLL_EDIT_FIELDS,
  rowUpdateFromEdit,
  STATUTORY_OVERRIDE_COLUMNS,
  typedStatutory,
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

const statutory = {
  epf_ee: 330,
  socso_ee: 15,
  eis_ee: 6,
  pcb: 0,
  epf_er: 390,
  socso_er: 52.65,
  eis_er: 6,
}

describe('rowUpdateFromEdit', () => {
  const row = { ...saved, ...statutory }

  it('sends every input but no statutory figure nobody typed', () => {
    const edit = editFromRow({ ...row, ot_amount: 120 })
    const update = rowUpdateFromEdit(edit, row, { commissionDerived: false })
    expect(update).toEqual({ ...saved, ot_amount: 120 })
    // Sending JADUAL's EPF back would pin it: it must stay free to follow the pay.
    expect(update).not.toHaveProperty('epf_ee')
  })

  it('sends a typed statutory figure, and only that one', () => {
    const edit = editFromRow({ ...row, epf_ee: 300, pcb: 45.5 })
    const update = rowUpdateFromEdit(edit, row, { commissionDerived: false })
    expect(update).toMatchObject({ epf_ee: 300, pcb: 45.5 })
    expect(Object.keys(update).filter(k => k in statutory).sort()).toEqual(['epf_ee', 'pcb'])
  })

  it('leaves a derived commission out — the run owns it', () => {
    const edit = editFromRow({ ...row, socso_er: 60 })
    const update = rowUpdateFromEdit(edit, row, { commissionDerived: true })
    expect(update).not.toHaveProperty('commission_amount')
    expect(update).toMatchObject({ socso_er: 60, basic_salary: 3000 })
  })
})

describe('payrollRowWrite', () => {
  it('passes inputs through and puts a typed figure in its override column', () => {
    const { columns, typed } = payrollRowWrite({ basic_salary: 3200, epf_ee: 300, pcb: 12.35, socso_er: 0 })
    expect(columns).toEqual({
      basic_salary: 3200,
      epf_ee_override_amount: 300,
      pcb_override_amount: 12.35,
      socso_er_override_amount: 0,
    })
    expect(typed).toBe(true)
    // Never onto the figure itself: the trigger derives it, and would write JADUAL over it.
    expect(columns).not.toHaveProperty('epf_ee')
  })

  it('is not a typed save when only inputs moved', () => {
    expect(payrollRowWrite({ ot_amount: 50, skbbk_amount: 10 })).toEqual({
      columns: { ot_amount: 50, skbbk_amount: 10 },
      typed: false,
    })
  })

  it('refuses a negative or non-numeric statutory figure', () => {
    expect(() => payrollRowWrite({ eis_ee: -1 })).toThrow('EIS employee must be zero or more.')
    expect(() => payrollRowWrite({ epf_er: Number.NaN })).toThrow('EPF employer must be zero or more.')
  })

  it('refuses PCB for somebody on withholding tax or no tax', () => {
    expect(() => payrollRowWrite({ pcb: 10 }, 'withholding')).toThrow(/withholding tax/)
    expect(() => payrollRowWrite({ pcb: 10 }, 'none')).toThrow(/no tax/)
    expect(payrollRowWrite({ pcb: 10 }, 'pcb').columns).toEqual({ pcb_override_amount: 10 })
    // The rest of their statutory is still theirs to type.
    expect(payrollRowWrite({ epf_ee: 10 }, 'none').columns).toEqual({ epf_ee_override_amount: 10 })
  })

  it('refuses a column the grid never sends — net, gross, status', () => {
    expect(() => payrollRowWrite({ net: 999999 } as Record<string, number>)).toThrow('Unknown payroll field: net')
    expect(() => payrollRowWrite({ epf_ee_override_amount: 1 } as Record<string, number>)).toThrow(/Unknown payroll field/)
  })
})

describe('typedStatutory', () => {
  it('reads the typed figures off the override columns', () => {
    expect(typedStatutory({ epf_ee_override_amount: 300, pcb_override_amount: 0, socso_er_override_amount: null })).toEqual([
      'epf_ee',
      'pcb',
    ])
    expect(typedStatutory({})).toEqual([])
    expect(STATUTORY_OVERRIDE_COLUMNS).toHaveLength(7)
  })
})

describe('editFromRow', () => {
  it('copies the sixteen editable figures as numbers', () => {
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
