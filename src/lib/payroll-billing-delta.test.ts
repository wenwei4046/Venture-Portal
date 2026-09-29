import { describe, it, expect } from 'vitest'
import { componentOfLine, computeBillingDeltas, type ShouldBillRow, type BilledRow } from './payroll-billing-delta'

const LABELS = { finance: 'Finance', director_office: 'Director Office', it: 'IT' }

const co = (companyId: string, shortCode: string) => ({ companyId, shortCode, name: shortCode })

function shouldRow(companyId: string, shortCode: string, segment: string, amount: number): ShouldBillRow {
  return { ...co(companyId, shortCode), segment, deptLabel: LABELS[segment as keyof typeof LABELS] ?? segment, amount }
}

describe('computeBillingDeltas (对数补差)', () => {
  it('exact match → zero delta, still listed as reconciled', () => {
    const rows = computeBillingDeltas(
      [shouldRow('c1', 'HK', 'finance', 1610.86)],
      [{ companyId: 'c1', segment: 'finance', amount: 1610.86 }],
      LABELS,
      new Map(),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].delta).toBe(0)
    expect(rows[0].positiveTotal).toBe(0)
    expect(rows[0].hasIssuedInvoice).toBe(true)
  })

  it('under-billed segment → positive delta on that segment only', () => {
    // The real Aug 2026 case: DO correction +124.39 for HC, finance untouched.
    const rows = computeBillingDeltas(
      [
        shouldRow('hc', 'HC', 'finance', 9805.33),
        shouldRow('hc', 'HC', 'director_office', 1535.97),
      ],
      [
        { companyId: 'hc', segment: 'finance', amount: 9805.33 },
        { companyId: 'hc', segment: 'director_office', amount: 1411.58 },
      ],
      LABELS,
      new Map(),
    )
    expect(rows[0].delta).toBe(124.39)
    expect(rows[0].positiveTotal).toBe(124.39)
    expect(rows[0].negatives).toHaveLength(0)
    const doSeg = rows[0].segments.find((s) => s.segment === 'director_office')!
    expect(doSeg.delta).toBe(124.39)
    expect(rows[0].segments.find((s) => s.segment === 'finance')!.delta).toBe(0)
  })

  it('mixed over/under: positiveTotal only counts under-billed, negatives reported', () => {
    const rows = computeBillingDeltas(
      [
        shouldRow('c1', '2990', 'director_office', 200),
        shouldRow('c1', '2990', 'finance', 100),
      ],
      [
        { companyId: 'c1', segment: 'director_office', amount: 50 },
        { companyId: 'c1', segment: 'finance', amount: 160 },
      ],
      LABELS,
      new Map(),
    )
    expect(rows[0].positiveTotal).toBe(150) // DO +150 only
    expect(rows[0].negatives).toHaveLength(1) // finance −60
    expect(rows[0].negatives[0].delta).toBe(-60)
    expect(rows[0].delta).toBe(90) // net, for display
  })

  it('company with allocation but no invoice at all → hasIssuedInvoice false', () => {
    const rows = computeBillingDeltas(
      [shouldRow('c9', 'NEW', 'it', 2420.77)],
      [],
      LABELS,
      new Map(),
    )
    expect(rows[0].hasIssuedInvoice).toBe(false)
    expect(rows[0].positiveTotal).toBe(2420.77)
  })

  it('billed-only company (allocation vanished) resolves name from companyMetaById', () => {
    const rows = computeBillingDeltas(
      [],
      [{ companyId: 'gone', segment: 'finance', amount: 500 }],
      LABELS,
      new Map([['gone', { shortCode: 'CAR', name: 'Carlisle' }]]),
    )
    expect(rows[0].shortCode).toBe('CAR')
    expect(rows[0].delta).toBe(-500)
    expect(rows[0].positiveTotal).toBe(0)
  })

  it('half-sen rounding noise is treated as reconciled', () => {
    const rows = computeBillingDeltas(
      [shouldRow('c1', 'HK', 'finance', 100.004)],
      [{ companyId: 'c1', segment: 'finance', amount: 100 }],
      LABELS,
      new Map(),
    )
    expect(rows[0].segments[0].delta).toBe(0)
    expect(rows[0].positiveTotal).toBe(0)
  })
})

// 2026-09-29: an adjustment reads like the original invoice — Salary, EPF,
// SOCSO and the rest on their own lines (user: "补回的我要明细拆成 salary,
// epf, socso, eis"). The split is a reading of both sides, never a guess.
describe('splitting the gap per component', () => {
  const hrComponents = { salary: 11553.28, allowance: 2747.22, epf: 1637, socso: 203.85, eis: 23.3 }

  it('a segment never billed splits into exactly its own components', () => {
    const rows = computeBillingDeltas(
      [{ ...co('hc', 'HC'), segment: 'hr', deptLabel: 'HR', amount: 8082.33, components: {
        salary: 5776.64, allowance: 1373.61, epf: 818.5, socso: 101.93, eis: 11.65,
      } }],
      [{ companyId: 'hc', segment: 'finance', amount: 9805.33, component: 'salary' }],
      LABELS,
      new Map(),
    )
    const hr = rows[0].segments.find((s) => s.segment === 'hr')!
    expect(hr.delta).toBe(8082.33)
    expect(hr.componentDeltas?.map((c) => [c.label, c.amount])).toEqual([
      ['Salary', 5776.64],
      ['Allowance', 1373.61],
      ['EPF', 818.5],
      ['SOCSO', 101.93],
      ['EIS', 11.65],
    ])
    // What matters most: the lines add up to the gap, to the sen.
    expect(hr.componentDeltas!.reduce((t, c) => t + c.amount, 0)).toBeCloseTo(hr.delta, 2)
  })

  it('a top-up on a partly billed segment nets each component', () => {
    const rows = computeBillingDeltas(
      [{ ...co('hc', 'HC'), segment: 'finance', deptLabel: 'Finance', amount: 1200, components: {
        salary: 1000, allowance: 0, epf: 150, socso: 40, eis: 10,
      } }],
      [
        { companyId: 'hc', segment: 'finance', amount: 900, component: 'salary' },
        { companyId: 'hc', segment: 'finance', amount: 150, component: 'epf' },
      ],
      LABELS,
      new Map(),
    )
    const fin = rows[0].segments[0]
    expect(fin.delta).toBe(150)
    expect(fin.componentDeltas).toEqual([
      { key: 'salary', label: 'Salary', amount: 100 },
      { key: 'socso', label: 'SOCSO', amount: 40 },
      { key: 'eis', label: 'EIS', amount: 10 },
    ])
  })

  it('refuses to split when a component was over-billed inside the gap', () => {
    const rows = computeBillingDeltas(
      [{ ...co('hc', 'HC'), segment: 'finance', deptLabel: 'Finance', amount: 1200, components: {
        salary: 1000, allowance: 0, epf: 150, socso: 40, eis: 10,
      } }],
      [
        { companyId: 'hc', segment: 'finance', amount: 800, component: 'salary' },
        { companyId: 'hc', segment: 'finance', amount: 200, component: 'epf' },
      ],
      LABELS,
      new Map(),
    )
    expect(rows[0].segments[0].delta).toBe(200)
    expect(rows[0].segments[0].componentDeltas).toBeNull()
  })

  it('refuses to split when a billed line names no component', () => {
    const rows = computeBillingDeltas(
      [{ ...co('hc', 'HC'), segment: 'finance', deptLabel: 'Finance', amount: 1200, components: {
        salary: 1000, allowance: 0, epf: 150, socso: 40, eis: 10,
      } }],
      [{ companyId: 'hc', segment: 'finance', amount: 900, component: null }],
      LABELS,
      new Map(),
    )
    expect(rows[0].segments[0].componentDeltas).toBeNull()
  })

  it('hands the rounding remainder to the biggest component', () => {
    const rows = computeBillingDeltas(
      [{ ...co('hc', 'HC'), segment: 'hr', deptLabel: 'HR', amount: 100.01, components: {
        salary: 33.333, allowance: 33.333, epf: 33.333, socso: 0, eis: 0,
      } }],
      [{ companyId: 'hc', segment: 'finance', amount: 1, component: 'salary' }],
      LABELS,
      new Map(),
    )
    const hr = rows[0].segments.find((s) => s.segment === 'hr')!
    const sum = hr.componentDeltas!.reduce((t, c) => t + c.amount, 0)
    expect(Math.round(sum * 100) / 100).toBe(hr.delta)
  })
})

describe('componentOfLine', () => {
  it('reads an original invoice line', () => {
    expect(componentOfLine("Salary - Aug'26")).toBe('salary')
    expect(componentOfLine("EPF - Aug'26")).toBe('epf')
    expect(componentOfLine("Salary - Aug'26 (HR)")).toBe('salary')
  })

  it('reads an adjustment line back, so a second run can still split', () => {
    expect(componentOfLine("HR Salary adjustment - Aug'26")).toBe('salary')
    expect(componentOfLine("Director Office SOCSO adjustment - Aug'26")).toBe('socso')
  })

  it('returns null for a lump line or anything hand-typed', () => {
    expect(componentOfLine("Finance payroll adjustment - Aug'26")).toBeNull()
    expect(componentOfLine('Website & software tools')).toBeNull()
    expect(componentOfLine(null)).toBeNull()
  })
})
