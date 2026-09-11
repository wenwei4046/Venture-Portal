import { describe, expect, it } from 'vitest'
import { calculateRevenuePayrollSplit, computeRevenuePayrollSplit, type RevenuePayrollSplitInput } from './revenue-payroll'

const basicExample: RevenuePayrollSplitInput = {
  grossCommission: 10_000, basicPay: 5_000, epfEr: 650, epfEe: 550,
  socsoEr: 86.65, socsoEe: 24.75, eisEr: 9.90, eisEe: 9.90, pcb: 112.65,
}

describe('Revenue net-basic and commission payments', () => {
  it('allocates the commission budget to net basic, commission and statutory liabilities', () => {
    const split = computeRevenuePayrollSplit(basicExample)
    expect(split.basicGross).toBe(5_000)
    expect(split.basicPay).toBe(4_302.70)
    expect(split.commissionBalance).toBe(4_253.45)
    expect(split.totalPayout).toBe(8_556.15)
    expect(Math.round(split.totalPayout * 100) + 69_730 + 74_655).toBe(1_000_000)
    expect(split.shortfall).toBe(0)
    expect(split.basicShortfall).toBe(0)
  })

  it('takes an editable PCB override from basic once, without reducing commission again', () => {
    const split = computeRevenuePayrollSplit({ ...basicExample, pcb: 200 })
    expect(split.basicPay).toBe(4_215.35)
    expect(split.commissionBalance).toBe(4_253.45)
    expect(split.totalPayout).toBe(8_468.80)
  })

  it('pays only commission when there is no basic or statutory amount', () => {
    const split = computeRevenuePayrollSplit({ grossCommission: 18_500.75, basicPay: 0,
      epfEr: 0, epfEe: 0, socsoEr: 0, socsoEe: 0, eisEr: 0, eisEe: 0, pcb: 0 })
    expect(split.basicPay).toBe(0)
    expect(split.commissionBalance).toBe(18_500.75)
    expect(split.totalPayout).toBe(18_500.75)
  })

  it('puts other earnings, deductions and withholding in the residual commission payment', () => {
    const split = computeRevenuePayrollSplit({ ...basicExample, otherEarnings: 350.50,
      otherDeductions: 120.25, withholdingTax: 100 })
    expect(split.basicPay).toBe(4_302.70)
    expect(split.commissionBalance).toBe(4_383.70)
    expect(split.totalPayout).toBe(8_686.40)
  })

  it('exposes insufficient commission and an over-deducted basic separately', () => {
    const commissionShortfall = computeRevenuePayrollSplit({ ...basicExample, grossCommission: 5_000 })
    expect(commissionShortfall.commissionBalance).toBe(-746.55)
    expect(commissionShortfall.shortfall).toBe(746.55)
    const basicShortfall = computeRevenuePayrollSplit({ ...basicExample, pcb: 5_000 })
    expect(basicShortfall.basicPay).toBe(-584.65)
    expect(basicShortfall.basicShortfall).toBe(584.65)
    expect(basicShortfall.commissionBalance).toBe(4_253.45)
  })

  const row = { commission_amount: 10_000, basic_salary: 5_000, prorata_days_worked: 15,
    prorata_days_in_month: 30, epf_er: 325, epf_ee: 275, socso_er: 42.85, socso_ee: 12.25,
    eis_er: 4.90, eis_ee: 4.90, pcb: 0, payout_split_version: 2 }

  it('prorates gross basic, never upstream commission, using the database six-decimal ratio', () => {
    const split = calculateRevenuePayrollSplit(row)
    expect(split.basicGross).toBe(2_500)
    expect(split.basicPay).toBe(2_207.85)
    expect(split.commissionBalance).toBe(7_127.25)
    expect(calculateRevenuePayrollSplit({ ...row, prorata_days_worked: 20, prorata_days_in_month: 31 }).basicGross).toBe(3_225.81)
  })

  it('uses persisted v2 components and leaves legacy snapshots on their former interpretation', () => {
    expect(calculateRevenuePayrollSplit({ ...row, basic_pay_net: 2_200, commission_balance: 7_120 }).totalPayout).toBe(9_320)
    const legacy = calculateRevenuePayrollSplit({ ...row, payout_split_version: null, commission_balance: 6_900 })
    expect(legacy.basicPay).toBe(2_500)
    expect(legacy.commissionBalance).toBe(6_900)
  })

  it('handles a zero day count and rejects invalid numeric inputs', () => {
    expect(calculateRevenuePayrollSplit({ ...row, prorata_days_in_month: 0 }).basicGross).toBe(0)
    expect(() => computeRevenuePayrollSplit({ ...basicExample, grossCommission: NaN })).toThrow('finite')
  })
})
