import { describe, it, expect } from 'vitest'
import { computeBillingDeltas, type ShouldBillRow, type BilledRow } from './payroll-billing-delta'

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
