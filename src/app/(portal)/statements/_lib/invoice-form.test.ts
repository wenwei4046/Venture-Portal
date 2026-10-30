import { describe, expect, it } from 'vitest'
import {
  billToValue,
  categoryGroups,
  hrDescription,
  hrSource,
  modeOptions,
  newInvoiceDate,
  parseBillTo,
  partialSentence,
  periodChoices,
  planCompanyInvoices,
  plusDays,
  rechargeParts,
} from './invoice-form'

// The invoice dialogs' rules (2026-10-14, the Finance revamp v2 — D10's
// inv-form): one Bill to for every kind of party, the modes in the hub's words,
// the accounts income first, the months, HR's figures as lines, and what
// Several companies writes — an invoice for each company, HR's figure itemised
// on an account for each kind of line (2026-10-30).

// HR's Sep'26 director CTC per subsidiary (get_director_ctc_by_company).
const CTC = new Map([
  ['co-hc', { basic: 22800, kpi: 0, allowance: 0, epf: 2736, socso: 208.3, eis: 23.8 }],
  ['co-2990', { basic: 2500, kpi: 0, allowance: 6769.38, epf: 325, socso: 42.85, eis: 4.9 }],
])
const STAFF = { salary: 933.2, allowance: 279.96, epf: 121.32, socso: 16.13, eis: 1.84 }

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

  it('thirty days on', () => {
    expect(plusDays('2026-10-14', 30)).toBe('2026-11-13')
  })

  it('a new invoice’s date: today in this month or one ahead, a month gone by’s last day', () => {
    expect(newInvoiceDate('2026-10', '2026-10-30')).toBe('2026-10-30')
    expect(newInvoiceDate('2026-11', '2026-10-30')).toBe('2026-10-30')
    // October's director CTC billed back on 5 November, as September's was on 6 October (dated 30 Sep).
    expect(newInvoiceDate('2026-10', '2026-11-05')).toBe('2026-10-31')
    expect(newInvoiceDate('2026-09', '2026-10-06')).toBe('2026-09-30')
    expect(newInvoiceDate('2026-02', '2026-03-02')).toBe('2026-02-28')
    expect(newInvoiceDate('2025-12', '2026-01-04')).toBe('2025-12-31')
  })
})

describe('HR’s figures as lines', () => {
  it('a director’s CTC as the director invoices read, each line its kind, nothing at zero', () => {
    expect(rechargeParts({ ctc: CTC.get('co-hc') }, 'director_attribution', '2026-09')).toEqual([
      { kind: 'Salary', description: "Salary - Sep'26", amount: 22800 },
      { kind: 'EPF', description: "EPF - Sep'26", amount: 2736 },
      { kind: 'SOCSO', description: "SOCSO - Sep'26", amount: 208.3 },
      { kind: 'EIS', description: "EIS - Sep'26", amount: 23.8 },
    ])
  })

  it('a shared-services department’s staff cost as Multi-line invoice wrote it', () => {
    expect(rechargeParts({ staff: STAFF }, 'finance_attribution', '2026-09').map((p) => [p.kind, p.description])).toEqual([
      ['Salary', "Salary - Sep'26 (Finance)"],
      ['Allowance', "Allowance - Sep'26 (Finance)"],
      ['EPF', "EPF - Sep'26 (Finance)"],
      ['SOCSO', "SOCSO - Sep'26 (Finance)"],
      ['EIS', "EIS - Sep'26 (Finance)"],
    ])
    expect(rechargeParts({}, 'hr_attribution', '2026-09')).toEqual([])
  })

  it('the description each starts with', () => {
    expect(hrDescription('hr_attribution', '2026-09')).toBe("Salary - HR - Sep'26")
    expect(hrDescription('director_attribution', '2026-09')).toBe('Director salary CTC — September 2026')
  })
})

describe('what Several companies writes', () => {
  const parts = (companyId: string) => {
    const c = CTC.get(companyId)
    return c ? rechargeParts({ ctc: c }, 'director_attribution', '2026-09') : []
  }
  const ACCOUNTS = { Salary: '5050', Allowance: '5051', EPF: '5052', SOCSO: '5052', EIS: '5052' }

  // 2026-10-30 (user: "往后 director 的我也要 split category").
  it('a company at HR’s figure is itemised, each line on the account picked for its kind', () => {
    const out = planCompanyInvoices({
      rows: [
        { companyId: 'co-hc', amount: 25768.1 },
        { companyId: 'co-2990', amount: 9642.13 },
      ],
      parts,
      description: 'Director salary CTC — September 2026',
      account: '',
      kinds: ['Salary', 'Allowance', 'EPF', 'SOCSO', 'EIS'],
      kindAccounts: ACCOUNTS,
    })
    expect(out[0]).toEqual({
      companyId: 'co-hc',
      lines: [
        { description: "Salary - Sep'26", amount: 22800, categoryCode: '5050' },
        { description: "EPF - Sep'26", amount: 2736, categoryCode: '5052' },
        { description: "SOCSO - Sep'26", amount: 208.3, categoryCode: '5052' },
        { description: "EIS - Sep'26", amount: 23.8, categoryCode: '5052' },
      ],
    })
    expect(out[1].lines.map((l) => [l.description, l.categoryCode])).toEqual([
      ["Salary - Sep'26", '5050'],
      ["Allowance - Sep'26", '5051'],
      ["EPF - Sep'26", '5052'],
      ["SOCSO - Sep'26", '5052'],
      ["EIS - Sep'26", '5052'],
    ])
  })

  it('an amount Finance changed, or a company HR has nothing for, is one line on Salary’s account', () => {
    const out = planCompanyInvoices({
      rows: [
        { companyId: 'co-hc', amount: 25000 },
        { companyId: 'co-conts', amount: 800 },
      ],
      parts,
      description: 'Director salary CTC — September 2026',
      account: '',
      kinds: ['Salary', 'EPF', 'SOCSO', 'EIS'],
      kindAccounts: ACCOUNTS,
    })
    expect(out).toEqual([
      { companyId: 'co-hc', lines: [{ description: 'Director salary CTC — September 2026', amount: 25000, categoryCode: '5050' }] },
      { companyId: 'co-conts', lines: [{ description: 'Director salary CTC — September 2026', amount: 800, categoryCode: '5050' }] },
    ])
  })

  it('typed amounts, no kind of HR’s line: one line each, in the invoice’s words, on the one account', () => {
    const out = planCompanyInvoices({
      rows: [
        { companyId: 'co-hc', amount: 300 },
        { companyId: 'co-2990', amount: 150 },
      ],
      parts,
      description: 'Claude AI Claim - YH',
      account: '9087',
      kinds: [],
      kindAccounts: {},
    })
    expect(out.map((p) => p.lines)).toEqual([[{ description: 'Claude AI Claim - YH', amount: 300, categoryCode: '9087' }], [{ description: 'Claude AI Claim - YH', amount: 150, categoryCode: '9087' }]])
  })
})

describe('a batch', () => {
  it('names what failed among what went in', () => {
    expect(partialSentence(2, [{ label: 'HOUZS Sofa (HS) · HR attribution', reason: 'Period 2026-09 is closed' }])).toBe(
      'Created 2 of 3 — HOUZS Sofa (HS) · HR attribution: Period 2026-09 is closed',
    )
  })
})
