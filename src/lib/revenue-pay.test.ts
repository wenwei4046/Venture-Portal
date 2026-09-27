import { describe, it, expect } from 'vitest'
import {
  buildPayRow,
  computeRevenuePay,
  payTotals,
  prorataRatio,
  type PayRowSource,
  type RevenuePayInput,
} from './revenue-pay'
import { computeRevenuePayrollSplit } from './revenue-payroll'

/** A full-commission salesperson: no basic, no allowance, so no statutory. */
function fullCommission(over: Partial<RevenuePayInput> = {}): RevenuePayInput {
  return {
    commission: 12_000,
    basicSalary: 0,
    statutoryAllowance: 0,
    nonStatutoryAllowance: 0,
    otAmount: 0,
    deductionAmount: 0,
    skbbkAmount: 0,
    daysWorked: 31,
    daysInMonth: 31,
    epfEr: 0,
    epfEe: 0,
    socsoEr: 0,
    socsoEe: 0,
    eisEr: 0,
    eisEe: 0,
    pcb: 0,
    taxMode: 'pcb',
    withholdingRate: 0.02,
    ...over,
  }
}

/** A salesperson carrying a basic: the schedules bite, and the employer's share comes out of commission. */
function withBasic(over: Partial<RevenuePayInput> = {}): RevenuePayInput {
  return fullCommission({
    commission: 10_000,
    basicSalary: 3_000,
    epfEr: 390,
    epfEe: 330,
    socsoEr: 51.65,
    socsoEe: 14.75,
    eisEr: 5.9,
    eisEe: 5.9,
    ...over,
  })
}

describe('prorataRatio', () => {
  it('is the trigger’s six decimals, not the float', () => {
    expect(prorataRatio(15, 31)).toBe(0.483871)
    expect(prorataRatio(31, 31)).toBe(1)
  })

  it('is zero for a month nobody worked, or a month with no days', () => {
    expect(prorataRatio(0, 30)).toBe(0)
    expect(prorataRatio(10, 0)).toBe(0)
  })
})

describe('computeRevenuePay', () => {
  it('pays a full-commission month straight through', () => {
    const pay = computeRevenuePay(fullCommission())
    expect(pay.statutoryWages).toBe(0)
    expect(pay.gross).toBe(12_000)
    expect(pay.net).toBe(12_000)
    expect(pay.basicPayNet).toBe(0)
    expect(pay.commissionBalance).toBe(12_000)
    expect(pay.shortfall).toBe(0)
  })

  it('funds the employer’s contributions out of the commission', () => {
    const pay = computeRevenuePay(withBasic())
    expect(pay.statutoryWages).toBe(3_000)
    expect(pay.employerContributions).toBe(447.55)
    // 10,000 − 390 − 51.65 − 5.90
    expect(pay.gross).toBe(9_552.45)
    // gross − 330 − 14.75 − 5.90
    expect(pay.net).toBe(9_201.8)
    // 3,000 − the same employee contributions
    expect(pay.basicPayNet).toBe(2_649.35)
    expect(pay.commissionBalance).toBe(6_552.45)
    expect(pay.basicPayNet + pay.commissionBalance).toBeCloseTo(pay.net, 2)
  })

  it('takes PCB off net but never lets commission raise it', () => {
    const pay = computeRevenuePay(withBasic({ pcb: 120.5 }))
    expect(pay.pcb).toBe(120.5)
    expect(pay.withholdingTax).toBe(0)
    expect(pay.net).toBe(9_081.3)
    expect(pay.basicPayNet).toBe(2_528.85)
  })

  it('charges withholding on gross instead, and never both', () => {
    const pay = computeRevenuePay(withBasic({ taxMode: 'withholding', pcb: 999 }))
    expect(pay.pcb).toBe(0)
    // 2% of 9,552.45
    expect(pay.withholdingTax).toBe(191.05)
    expect(pay.net).toBe(9_010.75)
  })

  it('charges neither when the staff record says so', () => {
    const pay = computeRevenuePay(withBasic({ taxMode: 'none', pcb: 999 }))
    expect(pay.pcb).toBe(0)
    expect(pay.withholdingTax).toBe(0)
  })

  it('pro-rates the basic, the statutory allowance and OT — never the commission', () => {
    const pay = computeRevenuePay(
      fullCommission({
        commission: 8_000,
        basicSalary: 3_100,
        statutoryAllowance: 310,
        otAmount: 620,
        daysWorked: 15,
      }),
    )
    expect(pay.ratio).toBe(0.483871)
    expect(pay.proratedBasic).toBe(1_500)
    expect(pay.proratedStatutoryAllowance).toBe(150)
    expect(pay.proratedOt).toBe(300)
    // commission untouched by the ratio: 8,000 + 150 + 300
    expect(pay.gross).toBe(8_450)
  })

  it('floors the statutory wage at zero when a deduction swallows the basic', () => {
    const pay = computeRevenuePay(withBasic({ deductionAmount: 4_000 }))
    expect(pay.statutoryWages).toBe(0)
    // the deduction still comes off gross
    expect(pay.gross).toBe(5_552.45)
  })

  it('surfaces a shortfall rather than flooring it', () => {
    const pay = computeRevenuePay(withBasic({ commission: 2_000 }))
    expect(pay.commissionBalance).toBeLessThan(0)
    expect(pay.shortfall).toBe(1_447.55)
  })

  it('surfaces a basic that cannot carry its own deductions', () => {
    const pay = computeRevenuePay(withBasic({ basicSalary: 100 }))
    expect(pay.basicShortfall).toBeGreaterThan(0)
  })

  it('agrees with the payroll split the payslip already uses', () => {
    for (const input of [
      fullCommission(),
      withBasic(),
      withBasic({ pcb: 88.4, skbbkAmount: 50 }),
      withBasic({ payLineEarnings: 650, payLineDeductions: 120 }),
    ]) {
      const pay = computeRevenuePay(input)
      const split = computeRevenuePayrollSplit({
        grossCommission: input.commission,
        basicPay: input.basicSalary * pay.ratio,
        epfEr: input.epfEr,
        epfEe: input.epfEe,
        socsoEr: input.socsoEr,
        socsoEe: input.socsoEe,
        eisEr: input.eisEr,
        eisEe: input.eisEe,
        pcb: pay.pcb,
        withholdingTax: pay.withholdingTax,
        otherEarnings: pay.proratedStatutoryAllowance + pay.proratedOt + input.nonStatutoryAllowance
          + (input.payLineEarnings ?? 0),
        otherDeductions: input.deductionAmount + input.skbbkAmount + (input.payLineDeductions ?? 0),
      })
      expect(pay.net).toBeCloseTo(split.totalPayout, 2)
      expect(pay.basicPayNet).toBeCloseTo(split.basicPay, 2)
      expect(pay.commissionBalance).toBeCloseTo(split.commissionBalance, 2)
    }
  })
})

// Pay lines (2026-09-27): what HR adds to the month on Comm Cal. The figures
// below are the ones the payroll triggers produced on the live schema in the
// migration's rolled-back dry run, so the twin and the triggers are held to
// the same numbers.
describe('computeRevenuePay · pay lines', () => {
  it('adds an earning to gross and a deduction to take-home only — as the trigger did on CHEA HUAN’s row', () => {
    // September's placeholder row: no commission yet, a RM 500 special claim
    // and a RM 200 deduction → trigger wrote gross 500, net 300, balance 300.
    const pay = computeRevenuePay(fullCommission({ commission: 0, payLineEarnings: 500, payLineDeductions: 200 }))
    expect(pay.gross).toBe(500)
    expect(pay.net).toBe(300)
    expect(pay.commissionBalance).toBe(300)
    expect(pay.payLineEarnings).toBe(500)
    expect(pay.payLineDeductions).toBe(200)
    expect(pay.totalDeductions).toBe(200)
  })

  it('pays the earnings in full on a part month and keeps them out of the statutory wage', () => {
    const base = computeRevenuePay(withBasic({ daysWorked: 15 }))
    const pay = computeRevenuePay(withBasic({ daysWorked: 15, payLineEarnings: 500 }))
    expect(pay.statutoryWages).toBe(base.statutoryWages)
    expect(pay.employerContributions).toBe(base.employerContributions)
    expect(pay.pcb).toBe(base.pcb)
    expect(pay.gross).toBeCloseTo(base.gross + 500, 2)
    expect(pay.net).toBeCloseTo(base.net + 500, 2)
    expect(pay.basicPayNet).toBe(base.basicPayNet)
  })

  it('leaves gross, statutory and tax alone for a deduction', () => {
    const base = computeRevenuePay(withBasic({ pcb: 120.5 }))
    const pay = computeRevenuePay(withBasic({ pcb: 120.5, payLineDeductions: 350.25 }))
    expect(pay.gross).toBe(base.gross)
    expect(pay.pcb).toBe(base.pcb)
    expect(pay.net).toBeCloseTo(base.net - 350.25, 2)
    expect(pay.commissionBalance).toBeCloseTo(base.commissionBalance - 350.25, 2)
  })

  it('charges withholding on the earnings with the rest of gross, never on a deduction', () => {
    const pay = computeRevenuePay(withBasic({ taxMode: 'withholding', payLineEarnings: 1_000, payLineDeductions: 400 }))
    // 2% of (9,552.45 + 1,000)
    expect(pay.withholdingTax).toBe(211.05)
    expect(pay.net).toBeCloseTo(9_552.45 + 1_000 - 330 - 14.75 - 5.9 - 211.05 - 400, 2)
  })

  it('shows a deduction bigger than the pay as a shortfall, not a floor', () => {
    const pay = computeRevenuePay(fullCommission({ commission: 100, payLineDeductions: 300 }))
    expect(pay.net).toBe(-200)
    expect(pay.shortfall).toBe(200)
  })
})

function source(over: Partial<PayRowSource> = {}): PayRowSource {
  const { commission, ...input } = fullCommission()
  void commission
  return {
    staffId: 's1',
    employeeName: 'ADRIAN',
    employeeCode: 'HV020',
    designation: 'Sales Executive',
    employmentType: 'commission_eligible',
    commissionHere: 5_000,
    commissionElsewhere: 0,
    payrollAdjustment: 0,
    payrollExists: false,
    payrollStatus: null,
    payrollCommission: null,
    payrollGross: null,
    payrollNet: null,
    input,
    ...over,
  }
}

describe('buildPayRow', () => {
  it('adds every programme’s share and the payroll adjustment', () => {
    const row = buildPayRow(source({ commissionElsewhere: 1_200, payrollAdjustment: -200 }))
    expect(row.commission).toBe(6_000)
    expect(row.pay.net).toBe(6_000)
  })

  it('says nothing about payroll when there is no payroll row', () => {
    expect(buildPayRow(source()).differsFromPayroll).toBe(false)
  })

  it('flags a payroll row that no longer matches the run', () => {
    const row = buildPayRow(source({ payrollExists: true, payrollNet: 4_000 }))
    expect(row.differsFromPayroll).toBe(true)
  })

  it('accepts a payroll row that agrees to the cent', () => {
    const row = buildPayRow(source({ payrollExists: true, payrollNet: 5_000 }))
    expect(row.differsFromPayroll).toBe(false)
  })

  it('carries the month’s pay lines into the preview, and agrees with a payroll row that holds them', () => {
    const { input } = source()
    const withLines = { ...input, payLineEarnings: 500, payLineDeductions: 200 }
    const row = buildPayRow(source({ input: withLines, payrollExists: true, payrollNet: 5_300 }))
    expect(row.commission).toBe(5_000)
    expect(row.pay.gross).toBe(5_500)
    expect(row.pay.net).toBe(5_300)
    expect(row.differsFromPayroll).toBe(false)
  })
})

describe('payTotals', () => {
  it('adds the board up', () => {
    const rows = [
      buildPayRow(source()),
      buildPayRow(source({ staffId: 's2', employeeName: 'BEN', commissionHere: 2_500.55 })),
    ]
    const totals = payTotals(rows)
    expect(totals.people).toBe(2)
    expect(totals.commission).toBe(7_500.55)
    expect(totals.net).toBe(7_500.55)
  })

  it('is zero for an empty board', () => {
    expect(payTotals([]).people).toBe(0)
    expect(payTotals([]).net).toBe(0)
  })
})
