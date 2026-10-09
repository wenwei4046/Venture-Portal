import { describe, expect, it } from 'vitest'
import { agingByDays, buildInstallmentAging, dueDateIn, sumDayBuckets, unpaidInstallments } from './loan-aging'
import { buildSegmentedAging, segmentedUnpaid } from './treasury-terms'

// 2026-10-09 — Loan Aging by days late for Finance's view (the user's Claude
// Design handoff): the same unpaid installments as the month aging (payments
// pooled, oldest first), each now aged from its own due day — not due yet,
// 1–30, 31–90 or over 90 days late.

describe('an installment’s due day', () => {
  it('falls on the deal’s day, or the month’s last when the month is shorter', () => {
    expect(dueDateIn('2026-10', 15)).toBe('2026-10-15')
    expect(dueDateIn('2026-02', 31)).toBe('2026-02-28')
    expect(dueDateIn('2026-04', 31)).toBe('2026-04-30')
  })
})

describe('loan aging by days', () => {
  it('splits the month’s installment not yet due from one already late', () => {
    const unpaid = unpaidInstallments({ principal: 12000, monthlyRate: 0.01, tenureMonths: 3, firstDueYM: '2026-08', asOfYM: '2026-10', totalPaid: 4120 })
    expect(unpaid).toEqual([
      { ym: '2026-09', unpaid: 4120 },
      { ym: '2026-10', unpaid: 4120 },
    ])
    expect(agingByDays(unpaid, 15, '2026-10-09')).toEqual({ notDue: 4120, d30: 4120, d90: 0, d90plus: 0, total: 8240 })
  })

  it('ages long-unpaid installments past 30 and 90 days', () => {
    const unpaid = unpaidInstallments({ principal: 12000, monthlyRate: 0.01, tenureMonths: 6, firstDueYM: '2026-04', asOfYM: '2026-10', totalPaid: 0 })
    expect(agingByDays(unpaid, 31, '2026-10-09')).toEqual({ notDue: 0, d30: 2120, d90: 4240, d90plus: 6360, total: 12720 })
  })

  it('keeps the month aging’s totals', () => {
    const args = { principal: 12000, monthlyRate: 0.01, tenureMonths: 6, firstDueYM: '2026-04', asOfYM: '2026-10', totalPaid: 3000 }
    const months = buildInstallmentAging(args)
    expect(agingByDays(unpaidInstallments(args), 15, '2026-10-09').total).toBe(months.total)
  })

  it('adds up', () => {
    const a = { notDue: 1, d30: 2, d90: 3, d90plus: 4, total: 10 }
    expect(sumDayBuckets([a, a])).toEqual({ notDue: 2, d30: 4, d90: 6, d90plus: 8, total: 20 })
  })
})

describe('segmented terms by days', () => {
  it('lists the same unpaid installments the segmented month aging buckets', () => {
    const segments = [
      { fromYM: '2026-08', toYM: '2026-10', rate: 0.01, compounding: false, months: 3, base: 12000, principalPerMonth: 4000, interestPerMonth: 120, scheduledEndYM: '2026-10', changed: false },
    ]
    const unpaid = segmentedUnpaid({ segments, asOfYM: '2026-10', totalPaid: 4120 })
    expect(unpaid).toEqual([
      { ym: '2026-09', unpaid: 4120 },
      { ym: '2026-10', unpaid: 4120 },
    ])
    expect(buildSegmentedAging({ segments, asOfYM: '2026-10', totalPaid: 4120 }).total).toBe(8240)
  })
})
