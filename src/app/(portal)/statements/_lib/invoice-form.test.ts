import { describe, expect, it } from 'vitest'
import {
  billToValue,
  categoryGroups,
  hrSource,
  modeOptions,
  monthEnd,
  parseBillTo,
  partialSentence,
  periodChoices,
  planCreateInvoices,
  plusDays,
  type InvoiceTarget,
} from './invoice-form'

// The invoice dialogs' rules (2026-10-14, the Finance revamp v2 — D10's
// inv-form): one Bill to for every kind of party, the modes in the hub's words,
// the accounts income first, the months, and what Save draft writes — the old
// Create Invoice's batch (companies × billing modes, a director's CTC itemised).

const HC: InvoiceTarget = { label: 'HOUZS Century (HC)', billKind: 'subsidiary', companyId: 'co-hc', amount: 25768.1 }
const C2990: InvoiceTarget = { label: '2990 (2990)', billKind: 'subsidiary', companyId: 'co-2990', amount: 9642.13 }
// HR's Sep'26 director CTC per subsidiary (get_director_ctc_by_company).
const CTC = new Map([
  ['co-hc', { basic: 22800, kpi: 0, allowance: 0, epf: 2736, socso: 208.3, eis: 23.8 }],
  ['co-2990', { basic: 2500, kpi: 0, allowance: 6769.38, epf: 325, socso: 42.85, eis: 4.9 }],
])

describe('Bill to', () => {
  it('holds a company, a department pool, a director or anyone else in one value', () => {
    expect(billToValue('subsidiary', 'co-hc')).toBe('co:co-hc')
    expect(billToValue('dept_pool', 'd-mkt')).toBe('dept:d-mkt')
    expect(billToValue('director')).toBe('director')
    expect(billToValue('freetext')).toBe('freetext')
    expect(billToValue('subsidiary', '')).toBe('')
    expect(parseBillTo('co:co-hc')).toEqual({ kind: 'subsidiary', companyId: 'co-hc', deptId: '' })
    expect(parseBillTo('dept:d-mkt')).toEqual({ kind: 'dept_pool', companyId: '', deptId: 'd-mkt' })
    expect(parseBillTo('freetext')).toEqual({ kind: 'freetext', companyId: '', deptId: '' })
    expect(parseBillTo('')).toEqual({ kind: null, companyId: '', deptId: '' })
  })
})

describe('the billing modes', () => {
  it('in the hub’s words, a provisioned department’s after them, an invoice’s own kept', () => {
    const extra = [{ value: 'revenue_department_attribution', label: 'Revenue Department Pool' }]
    expect(modeOptions(extra).map((m) => m.label)).toEqual([
      'HR attribution',
      'Marketing project',
      'Finance attribution',
      'Director Office OPEX',
      'Director OPEX',
      'Venture attribution',
      'Revenue Department attribution',
    ])
    expect(modeOptions([], 'payroll_consolidated').at(-1)).toEqual({ value: 'payroll_consolidated', label: 'Payroll (consolidated)' })
  })

  it('HR’s figures recharge the shared-services staff and the directors', () => {
    expect(hrSource('hr_attribution')).toBe('staff')
    expect(hrSource('director_office_attribution')).toBe('staff')
    expect(hrSource('director_attribution')).toBe('director')
    expect(hrSource('marketing_project')).toBeNull()
    expect(hrSource('it_attribution')).toBeNull()
  })
})

describe('the categories', () => {
  it('postable only (no header), income first', () => {
    const groups = categoryGroups([
      { code: '9000', label: 'Expenses', type: 'expense', parent_code: null },
      { code: '9091', label: 'Water & Electricity', type: 'expense', parent_code: '9000' },
      { code: '5050', label: 'Salary Income', type: 'revenue', parent_code: null },
      { code: '7012', label: 'Rental Income', type: 'other_income', parent_code: null },
      { code: '3059', label: 'Amount due from - Dream Crafter', type: 'asset', parent_code: null },
    ])
    expect(groups.map((g) => [g.label, g.accounts.map((a) => a.code)])).toEqual([
      ['Revenue', ['5050']],
      ['Other Income', ['7012']],
      ['Expense', ['9091']],
      ['Asset', ['3059']],
    ])
  })
})

describe('the months', () => {
  it('a year before the hub’s month to three after, newest first, and the one an invoice has', () => {
    const p = periodChoices('2026-10')
    expect(p).toHaveLength(16)
    expect(p[0]).toEqual({ value: '2027-01', label: 'January 2027' })
    expect(p.at(-1)).toEqual({ value: '2025-10', label: 'October 2025' })
    expect(periodChoices('2026-10', '2024-03').at(-1)?.value).toBe('2024-03')
  })

  it('the month’s last day, thirty days on', () => {
    expect(monthEnd('2026-09')).toBe('2026-09-30')
    expect(monthEnd('2028-02')).toBe('2028-02-29')
    expect(plusDays('2026-10-14', 30)).toBe('2026-11-13')
  })
})

describe('what Save draft writes', () => {
  const plan = (targets: InvoiceTarget[], pools: Array<{ mode: string; category: string; amount: number }>, split: boolean, several: boolean, ctc = new Map()) =>
    planCreateInvoices({ targets, pools, split, several, period: '2026-09', ctc })

  it('one party, one mode: one invoice at its amount', () => {
    const out = plan([{ label: 'Marketing', billKind: 'dept_pool', deptId: 'd-mkt', amount: 780.25 }], [{ mode: 'venture_attribution', category: '9091', amount: 780.25 }], false, false)
    expect(out).toEqual([
      { kind: 'one', label: 'Marketing', target: expect.objectContaining({ deptId: 'd-mkt' }), mode: 'venture_attribution', category: '9091', amount: 780.25 },
    ])
  })

  it('several companies: one invoice each, at each company’s amount', () => {
    const out = plan([HC, C2990], [{ mode: 'hr_attribution', category: '5050', amount: 0 }], false, true)
    expect(out.map((p) => [p.label, p.kind === 'one' ? p.amount : null])).toEqual([
      ['HOUZS Century (HC)', 25768.1],
      ['2990 (2990)', 9642.13],
    ])
  })

  it('one party split: each line its own invoice at the line’s amount, named by its mode', () => {
    const out = plan(
      [{ ...HC, amount: 1000 }],
      [
        { mode: 'hr_attribution', category: '5050', amount: 600 },
        { mode: 'finance_attribution', category: '5050', amount: 400 },
      ],
      true,
      false,
    )
    expect(out.map((p) => [p.label, p.mode, p.kind === 'one' ? p.amount : null])).toEqual([
      ['HOUZS Century (HC) · HR attribution', 'hr_attribution', 600],
      ['HOUZS Century (HC) · Finance attribution', 'finance_attribution', 400],
    ])
  })

  it('several companies split: the lines are proportions of each company’s amount, to the sen', () => {
    const out = plan(
      [
        { ...HC, amount: 1000 },
        { ...C2990, amount: 333.33 },
      ],
      [
        { mode: 'hr_attribution', category: '5050', amount: 2 },
        { mode: 'finance_attribution', category: '5050', amount: 1 },
      ],
      true,
      true,
    )
    expect(out.map((p) => (p.kind === 'one' ? p.amount : null))).toEqual([666.67, 333.33, 222.22, 111.11])
  })

  it('a line or a company at nothing writes nothing', () => {
    const out = plan([{ ...HC, amount: 0 }, C2990], [{ mode: 'hr_attribution', category: '5050', amount: 0 }], false, true)
    expect(out.map((p) => p.label)).toEqual(['2990 (2990)'])
  })

  // 2026-10-06 (user: "director 要 bill back 的我要拆 detail 可以吗？" → "可以").
  it('a director CTC at HR’s figure is itemised — Salary / Allowance / EPF / SOCSO / EIS, nothing at zero', () => {
    const out = plan([HC, C2990], [{ mode: 'director_attribution', category: '5050', amount: 0 }], false, true, CTC)
    expect(out[0]).toEqual({
      kind: 'lines',
      label: 'HOUZS Century (HC)',
      target: HC,
      mode: 'director_attribution',
      lines: [
        { description: "Salary - Sep'26", amount: 22800, categoryCode: '5050' },
        { description: "EPF - Sep'26", amount: 2736, categoryCode: '5050' },
        { description: "SOCSO - Sep'26", amount: 208.3, categoryCode: '5050' },
        { description: "EIS - Sep'26", amount: 23.8, categoryCode: '5050' },
      ],
    })
    expect(out[1].kind === 'lines' && out[1].lines.map((l) => l.description)).toEqual(["Salary - Sep'26", "Allowance - Sep'26", "EPF - Sep'26", "SOCSO - Sep'26", "EIS - Sep'26"])
  })

  it('a director CTC Finance changed goes out as one line; the others still itemised', () => {
    const out = plan([{ ...HC, amount: 25000 }, C2990], [{ mode: 'director_attribution', category: '5050', amount: 0 }], false, true, CTC)
    expect(out[0]).toEqual(expect.objectContaining({ kind: 'one', amount: 25000, category: '5050' }))
    expect(out[1].kind).toBe('lines')
  })

  it('names what failed among what went in', () => {
    expect(partialSentence(2, [{ label: 'HOUZS Sofa (HS) · HR attribution', reason: 'Period 2026-09 is closed' }])).toBe(
      'Created 2 of 3 — HOUZS Sofa (HS) · HR attribution: Period 2026-09 is closed',
    )
  })
})
