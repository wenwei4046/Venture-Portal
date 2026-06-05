import { describe, it, expect } from 'vitest'
import { loanMonthlyInstallment, sumSchedule, isLoanUnscheduled } from './treasury-schedule'

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
