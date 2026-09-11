import { describe, expect, it } from 'vitest'
import { calculateRevenuePayrollSplit, computeRevenuePayrollSplit } from './revenue-payroll'

describe('Revenue payroll split', () => {
  it('pays basic in full and funds both EPF contributions from the commission balance', () => {
    const split = computeRevenuePayrollSplit({ grossCommission: 10_000, basicPay: 5_000, epfEr: 650, epfEe: 550 })
    expect(split).toEqual({ basicPay: 5_000, commissionBalance: 3_800, totalPayBeforeOtherDeductions: 8_800, shortfall: 0 })
    // Gross payroll is 9,350; its normal 550 EPF EE deduction produces 8,800.
    expect(split.totalPayBeforeOtherDeductions + 650 + 550).toBe(10_000)
  })

  it('pays full commission when there is no basic or EPF', () => {
    expect(computeRevenuePayrollSplit({ grossCommission: 18_000, basicPay: 0, epfEr: 0, epfEe: 0 }))
      .toEqual({ basicPay: 0, commissionBalance: 18_000, totalPayBeforeOtherDeductions: 18_000, shortfall: 0 })
  })

  it('uses prorated basic but does not prorate upstream commission', () => {
    expect(calculateRevenuePayrollSplit({ commission_amount: 10_000, basic_salary: 5_000,
      prorata_days_worked: 15, prorata_days_in_month: 30, epf_er: 325, epf_ee: 275 }))
      .toEqual({ basicPay: 2_500, commissionBalance: 6_900, totalPayBeforeOtherDeductions: 9_400, shortfall: 0 })
  })

  it('handles zero worked days and the database six-decimal ratio', () => {
    const row = { commission_amount: 10_000, basic_salary: 5_000,
      prorata_days_worked: 0, prorata_days_in_month: 31, epf_er: 0, epf_ee: 0 }
    expect(calculateRevenuePayrollSplit(row).basicPay).toBe(0)
    expect(calculateRevenuePayrollSplit({ ...row, prorata_days_in_month: 0 }).basicPay).toBe(0)
    expect(calculateRevenuePayrollSplit({ ...row, prorata_days_worked: 20 }).basicPay).toBe(3_225.81)
  })

  it('retains a negative balance and explicitly exposes the funding shortfall', () => {
    expect(computeRevenuePayrollSplit({ grossCommission: 5_000, basicPay: 5_000, epfEr: 650, epfEe: 550 }))
      .toEqual({ basicPay: 5_000, commissionBalance: -1_200, totalPayBeforeOtherDeductions: 3_800, shortfall: 1_200 })
  })

  it('settles currency in cents and supports the exact zero-balance boundary', () => {
    expect(computeRevenuePayrollSplit({ grossCommission: 6_200.03, basicPay: 5_000.01, epfEr: 650.01, epfEe: 550.01 }))
      .toEqual({ basicPay: 5_000.01, commissionBalance: 0, totalPayBeforeOtherDeductions: 5_000.01, shortfall: 0 })
    expect(() => computeRevenuePayrollSplit({ grossCommission: NaN, basicPay: 0, epfEr: 0, epfEe: 0 })).toThrow('finite')
  })
})
