import { describe, it, expect } from 'vitest'
import {
  addMonthsYM,
  buildPositionRow,
  groupStatement,
  type PositionInput,
} from './counterparty-statement'

const base: PositionInput = {
  id: 'x',
  side: 'collect',
  counterparty: 'HC',
  principal: 120000,
  monthlyRate: 0.02,
  tenureMonths: 12,
  compounding: false,
  unscheduled: false,
  startDate: '2026-01-15',
  startMonth: null,
  principalPaid: 0,
  outstanding: 120000,
  paymentsByMonth: {},
}

describe('addMonthsYM', () => {
  it('rolls across year ends', () => {
    expect(addMonthsYM('2026-11', 3)).toBe('2027-02')
    expect(addMonthsYM('2026-01', 0)).toBe('2026-01')
  })
})

describe('buildPositionRow — flat', () => {
  it('remaining interest = remaining periods × 原额×月息; on schedule → contractual finish', () => {
    // Disbursed Jan 15 → first due Feb; Feb..Jul paid (6 × 10,000). Aug is
    // month 7 of 12 → 6 remaining after this month's in-flight installment.
    const r = buildPositionRow({ ...base, principalPaid: 60000, outstanding: 60000 }, '2026-08')!
    expect(r.kind).toBe('flat')
    expect(r.remainingPeriods).toBe(6)
    expect(r.monthlyInterest).toBe(2400) // 120,000 × 2%
    expect(r.interestOutstanding).toBe(14400) // 6 × 2,400
    expect(r.startYM).toBe('2026-02')
    expect(r.finishYM).toBe('2027-01') // 2026-02 + 11 months, contractual
  })

  it('behind schedule → projected finish pushes out from the current month', () => {
    // First due Feb, current Aug (7 installments scheduled) but only 2 paid →
    // 10 remaining, catching up one a month from Aug lands in 2027-05.
    const r = buildPositionRow({ ...base, principalPaid: 20000, outstanding: 100000 }, '2026-08')!
    expect(r.remainingPeriods).toBe(10)
    expect(r.finishYM).toBe('2027-05')
  })

  it('agreed 还款起始月 overrides the disbursement-based start', () => {
    const r = buildPositionRow({ ...base, startMonth: '2026-06' }, '2026-06')!
    expect(r.startYM).toBe('2026-06')
    expect(r.finishYM).toBe('2027-05') // 2026-06 + 11 — nothing due before start
  })
})

describe('buildPositionRow — compound / no-term / settled', () => {
  it('利滚利: interest outstanding = compounded balance − principal outstanding', () => {
    // 10,000 @ 2% since Jan, current Apr, nothing paid: balance 10,612.08
    // (same fixture as treasury-schedule tests) → accrued 612.08.
    const r = buildPositionRow(
      {
        ...base,
        principal: 10000,
        outstanding: 10000,
        compounding: true,
        startDate: '2026-01-05',
      },
      '2026-04',
    )!
    expect(r.kind).toBe('compound')
    expect(r.interestOutstanding).toBe(612.08)
    expect(r.finishYM).toBeNull()
  })

  it('no-term rows carry zero interest in totals and no payoff month', () => {
    const r = buildPositionRow({ ...base, tenureMonths: null, unscheduled: true }, '2026-08')!
    expect(r.kind).toBe('no_term')
    expect(r.interestOutstanding).toBe(0)
    expect(r.monthlyInterest).toBe(2400)
    expect(r.finishYM).toBeNull()
  })

  it('fully settled positions are skipped', () => {
    expect(buildPositionRow({ ...base, outstanding: 0 }, '2026-08')).toBeNull()
  })
})

describe('groupStatement', () => {
  it('merges both sides per counterparty and nets 要收 − 要还', () => {
    const collect = buildPositionRow(
      { ...base, principalPaid: 60000, outstanding: 60000 },
      '2026-08',
    )!
    const repay = buildPositionRow(
      {
        ...base,
        id: 'y',
        side: 'repay',
        principal: 50000,
        tenureMonths: 10,
        outstanding: 50000,
        startDate: '2026-07-01',
      },
      '2026-08',
    )!
    const { rows, totals } = groupStatement([collect, repay])
    expect(rows).toHaveLength(1)
    const hc = rows[0]
    expect(hc.collectPrincipal).toBe(60000)
    expect(hc.collectInterest).toBe(14400)
    expect(hc.repayPrincipal).toBe(50000)
    expect(hc.repayInterest).toBe(10000) // 10 × (50,000 × 2%)
    expect(hc.net).toBe(14400) // 74,400 − 60,000
    expect(totals.net).toBe(14400)
  })
})
