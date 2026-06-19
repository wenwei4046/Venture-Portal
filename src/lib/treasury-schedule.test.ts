import { describe, it, expect } from 'vitest'
import { loanMonthlyInstallment, sumSchedule, isLoanUnscheduled, isBeforeFirstInstallment, compoundInterestState } from './treasury-schedule'

describe('isBeforeFirstInstallment', () => {
  // Regression 2026-06-10: The Cont 120k disbursed 10 Jun (1mo tenure) showed
  // in JUNE's 应收 — its only installment is due in July.
  it('loan disbursed in the current month → not due yet', () => {
    expect(isBeforeFirstInstallment('2026-06-10', '2026-06')).toBe(true)
  })
  it('disbursed last month → first installment due this month', () => {
    expect(isBeforeFirstInstallment('2026-05-31', '2026-06')).toBe(false)
  })
  it('disbursed long ago → due (overdue handling is elsewhere)', () => {
    expect(isBeforeFirstInstallment('2025-09-01', '2026-06')).toBe(false)
  })
  it('forward-dated disbursement → not due yet', () => {
    expect(isBeforeFirstInstallment('2026-07-01', '2026-06')).toBe(true)
  })
  it('null/empty start date keeps legacy include behavior', () => {
    expect(isBeforeFirstInstallment(null, '2026-06')).toBe(false)
    expect(isBeforeFirstInstallment('', '2026-06')).toBe(false)
  })
})

describe('compoundInterestState (利滚利)', () => {
  it('compounds unpaid months: 10,000 @ 2% from Jan, current Apr, no payments', () => {
    const r = compoundInterestState({
      principal: 10000, monthlyRate: 0.02, startYM: '2026-01', currentYM: '2026-04', paymentsByMonth: {},
    })
    // Jan→10,200, Feb→10,404, Mar→10,612.08; Apr interest = 10,612.08 × 2%
    expect(r.balance).toBe(10612.08)
    expect(r.thisMonthInterest).toBe(212.24)
  })

  it('a paid month does not capitalise (balance shrinks by payment)', () => {
    const r = compoundInterestState({
      principal: 10000, monthlyRate: 0.02, startYM: '2026-01', currentYM: '2026-03',
      paymentsByMonth: { '2026-01': 200 }, // Jan interest serviced
    })
    // Jan: 10000+200-200=10000; Feb: 10000+200=10200; Mar interest = 204
    expect(r.balance).toBe(10200)
    expect(r.thisMonthInterest).toBe(204)
  })

  it('0% never compounds', () => {
    const r = compoundInterestState({
      principal: 50000, monthlyRate: 0, startYM: '2026-01', currentYM: '2026-12', paymentsByMonth: {},
    })
    expect(r.balance).toBe(50000)
    expect(r.thisMonthInterest).toBe(0)
  })

  it('start == current month: just this-month interest on principal', () => {
    const r = compoundInterestState({
      principal: 10000, monthlyRate: 0.02, startYM: '2026-06', currentYM: '2026-06', paymentsByMonth: {},
    })
    expect(r.balance).toBe(10000)
    expect(r.thisMonthInterest).toBe(200)
  })
})

describe('isLoanUnscheduled', () => {
  it('true for empty/undecided/no-method terms', () => {
    expect(isLoanUnscheduled(null)).toBe(true)
    expect(isLoanUnscheduled('')).toBe(true)
    expect(isLoanUnscheduled('新增 · 利息/期数/方式未定 · 放款日2026-04-30')).toBe(true)
    expect(isLoanUnscheduled('无息垫款 · 0% · 原表无还款方式')).toBe(true)
  })
  it('false for confirmed schedules', () => {
    expect(isLoanUnscheduled('EMI 分期 · 月息4% · 6期')).toBe(false)
    expect(isLoanUnscheduled('一次还清 · 月息2% · 1期')).toBe(false)
    expect(isLoanUnscheduled('自定义分期 · 月息2% · 2期')).toBe(false)
  })
})

describe('loanMonthlyInstallment', () => {
  it('computes flat monthly principal + interest (CAR 100,000 @ 2% × 12)', () => {
    const r = loanMonthlyInstallment({
      principal: 100000,
      effectiveRate: 0.02,
      tenureMonths: 12,
      principalPaid: 8333.33, // one period paid
    })
    expect(r.principalDue).toBe(8333.33)
    expect(r.interestDue).toBe(2000)
    expect(r.totalDue).toBe(10333.33)
    expect(r.periodsPaid).toBe(1)
    expect(r.remainingPeriods).toBe(11)
  })

  it('zero-rate loan has no interest', () => {
    const r = loanMonthlyInstallment({ principal: 10000, effectiveRate: 0, tenureMonths: 1, principalPaid: 0 })
    expect(r.interestDue).toBe(0)
    expect(r.principalDue).toBe(10000)
    expect(r.remainingPeriods).toBe(1)
  })

  it('fully-paid loan has 0 remaining periods', () => {
    const r = loanMonthlyInstallment({ principal: 60000, effectiveRate: 0.005, tenureMonths: 60, principalPaid: 60000 })
    expect(r.remainingPeriods).toBe(0)
  })

  it('guards tenure 0 (treat as 1)', () => {
    const r = loanMonthlyInstallment({ principal: 500, effectiveRate: 0.01, tenureMonths: 0, principalPaid: 0 })
    expect(r.principalDue).toBe(500)
  })
})

describe('sumSchedule', () => {
  it('sums principal / interest / total across rows', () => {
    const t = sumSchedule([
      { principalDue: 8333.33, interestDue: 2000, totalDue: 10333.33 },
      { principalDue: 1500, interestDue: 450, totalDue: 1950 },
    ])
    expect(t).toEqual({ principal: 9833.33, interest: 2450, total: 12283.33 })
  })
})
