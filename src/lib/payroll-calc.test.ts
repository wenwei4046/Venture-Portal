import { describe, expect, it } from 'vitest'
import {
  computeProrata,
  splitCommission,
  computeGrossAndNet,
  type CommissionRule,
  type PayrollRowInput,
  type StatutoryLookups,
} from './payroll-calc'

// ───────────────────────── computeProrata ─────────────────────────

describe('computeProrata', () => {
  const APR = '2026-04-01' // 30 days
  const FEB = '2026-02-01' // 28 days (2026 not leap)

  it('full month when no hire/resign dates', () => {
    const r = computeProrata(null, null, APR)
    expect(r).toEqual({ daysWorked: 30, daysInMonth: 30, ratio: 1 })
  })

  it('hired on day 1 is a full month', () => {
    const r = computeProrata('2026-04-01', null, APR)
    expect(r.daysWorked).toBe(30)
    expect(r.ratio).toBe(1)
  })

  it('hired on day 15 gives 16 working days (15..30)', () => {
    const r = computeProrata('2026-04-15', null, APR)
    expect(r.daysWorked).toBe(16)
    expect(r.daysInMonth).toBe(30)
    expect(r.ratio).toBeCloseTo(16 / 30, 6)
  })

  it('resigned on day 14 gives 14 working days (1..14)', () => {
    const r = computeProrata(null, '2026-04-14', APR)
    expect(r.daysWorked).toBe(14)
    expect(r.ratio).toBeCloseTo(14 / 30, 6)
  })

  it('hired and resigned in the same month', () => {
    const r = computeProrata('2026-04-10', '2026-04-20', APR)
    expect(r.daysWorked).toBe(11) // 10..20 inclusive = 11 days
    expect(r.ratio).toBeCloseTo(11 / 30, 6)
  })

  it('hire before period start = full month', () => {
    const r = computeProrata('2020-01-15', null, APR)
    expect(r.daysWorked).toBe(30)
  })

  it('resign after period end = full month', () => {
    const r = computeProrata(null, '2030-12-31', APR)
    expect(r.daysWorked).toBe(30)
  })

  it('hire after period end = 0 days', () => {
    const r = computeProrata('2026-05-15', null, APR)
    expect(r.daysWorked).toBe(0)
    expect(r.ratio).toBe(0)
  })

  it('resign before period start = 0 days', () => {
    const r = computeProrata(null, '2026-03-15', APR)
    expect(r.daysWorked).toBe(0)
  })

  it('28-day February handles days_in_month correctly', () => {
    const r = computeProrata(null, null, FEB)
    expect(r.daysInMonth).toBe(28)
    expect(r.daysWorked).toBe(28)
  })

  it('unpaid leave reduces days worked', () => {
    const r = computeProrata(null, null, APR, 5)
    expect(r.daysWorked).toBe(25)
    expect(r.ratio).toBeCloseTo(25 / 30, 6)
  })

  it('unpaid leave greater than days worked floors at 0', () => {
    const r = computeProrata('2026-04-25', null, APR, 10)
    // Hired day 25 = 6 days worked (25..30), minus 10 unpaid = -4 → floor 0
    expect(r.daysWorked).toBe(0)
    expect(r.ratio).toBe(0)
  })
})

// ───────────────────────── splitCommission ─────────────────────────

describe('splitCommission', () => {
  const PERIOD = '2026-04-01'

  const telemarketerTiered: CommissionRule = {
    ruleName: 'Telemarketer tiered',
    ruleType: 'tiered_per_unit',
    tierConfig: [
      { from: 1, to: 10, rate: 50 },
      { from: 11, to: 30, rate: 80 },
      { from: 31, to: null, rate: 100 },
    ],
    effectiveFrom: '2026-01-01',
  }

  it('tiered: 5 sales → 5 × 50 = 250', () => {
    const r = splitCommission([telemarketerTiered], { salesCount: 5, salesAmount: 0 }, PERIOD)
    expect(r.total).toBe(250)
    expect(r.perRule[0].amount).toBe(250)
  })

  it('tiered: 10 sales (boundary) → 10 × 50 = 500', () => {
    const r = splitCommission([telemarketerTiered], { salesCount: 10, salesAmount: 0 }, PERIOD)
    expect(r.total).toBe(500)
  })

  it('tiered: 15 sales → 10×50 + 5×80 = 900', () => {
    const r = splitCommission([telemarketerTiered], { salesCount: 15, salesAmount: 0 }, PERIOD)
    expect(r.total).toBe(900)
  })

  it('tiered: 30 sales (boundary) → 10×50 + 20×80 = 2100', () => {
    const r = splitCommission([telemarketerTiered], { salesCount: 30, salesAmount: 0 }, PERIOD)
    expect(r.total).toBe(2100)
  })

  it('tiered: 31 sales (into top tier) → 10×50 + 20×80 + 1×100 = 2200', () => {
    const r = splitCommission([telemarketerTiered], { salesCount: 31, salesAmount: 0 }, PERIOD)
    expect(r.total).toBe(2200)
  })

  it('tiered: 35 sales → 10×50 + 20×80 + 5×100 = 2600', () => {
    const r = splitCommission([telemarketerTiered], { salesCount: 35, salesAmount: 0 }, PERIOD)
    expect(r.total).toBe(2600)
  })

  it('tiered: 0 sales → 0', () => {
    const r = splitCommission([telemarketerTiered], { salesCount: 0, salesAmount: 0 }, PERIOD)
    expect(r.total).toBe(0)
  })

  it('pct_of_base: staff_sales_amount 5% of 10,000 = 500', () => {
    const rule: CommissionRule = {
      ruleName: 'MK 5% of sales',
      ruleType: 'pct_of_base',
      pct: 0.05,
      baseSource: 'staff_sales_amount',
      effectiveFrom: '2026-01-01',
    }
    const r = splitCommission([rule], { salesCount: 0, salesAmount: 10000 }, PERIOD)
    expect(r.total).toBe(500)
  })

  it('pct_of_base: staff_sales_count 10 × RM7.50 = 75', () => {
    const rule: CommissionRule = {
      ruleName: 'Head count bonus',
      ruleType: 'pct_of_base',
      pct: 7.5,
      baseSource: 'staff_sales_count',
      effectiveFrom: '2026-01-01',
    }
    const r = splitCommission([rule], { salesCount: 10, salesAmount: 0 }, PERIOD)
    expect(r.total).toBe(75)
  })

  it('pct_of_base: dept_np stubbed → 0 (Spec 2+)', () => {
    const rule: CommissionRule = {
      ruleName: 'MK 2% of dept NP',
      ruleType: 'pct_of_base',
      pct: 0.02,
      baseSource: 'dept_np',
      effectiveFrom: '2026-01-01',
    }
    const r = splitCommission([rule], { salesCount: 0, salesAmount: 0 }, PERIOD)
    expect(r.total).toBe(0)
  })

  it('multi-rule: tiered + pct both sum', () => {
    const rule2: CommissionRule = {
      ruleName: 'Bonus 2% of sales',
      ruleType: 'pct_of_base',
      pct: 0.02,
      baseSource: 'staff_sales_amount',
      effectiveFrom: '2026-01-01',
    }
    const r = splitCommission(
      [telemarketerTiered, rule2],
      { salesCount: 5, salesAmount: 10000 },
      PERIOD,
    )
    expect(r.perRule).toHaveLength(2)
    expect(r.total).toBe(250 + 200) // 5×50 + 2% of 10000
  })

  it('ineffective rule (before effective_from) is skipped', () => {
    const rule: CommissionRule = {
      ...telemarketerTiered,
      effectiveFrom: '2026-05-01',
    }
    const r = splitCommission([rule], { salesCount: 10, salesAmount: 0 }, PERIOD)
    expect(r.total).toBe(0)
    expect(r.perRule).toHaveLength(0)
  })

  it('retired rule (effective_to passed) is skipped', () => {
    const rule: CommissionRule = {
      ...telemarketerTiered,
      effectiveTo: '2026-03-31',
    }
    const r = splitCommission([rule], { salesCount: 10, salesAmount: 0 }, PERIOD)
    expect(r.total).toBe(0)
  })
})

// ───────────────────────── computeGrossAndNet ─────────────────────────

describe('computeGrossAndNet', () => {
  const basicRow: PayrollRowInput = {
    basicSalary: 5000,
    statutoryAllowance: 500,
    nonStatutoryAllowance: 300,
    otAmount: 200,
    commissionAmount: 100,
    unpaidLeaveDays: 0,
    hireDate: null,
    resignationDate: null,
    periodMonth: '2026-04-01',
  }

  // Approximate Malaysian schedule values at RM5,500 statutory wages (basic+stat):
  const basicLookups: StatutoryLookups = {
    isEpfExempt: false,
    epfLookup: { er: 715, ee: 605 },
    socsoLookup: { er: 86.65, ee: 24.75 },
    eisLookup: { er: 9.9, ee: 9.9 },
    pcb: 150,
  }

  it('full month, non-exempt, happy path', () => {
    const r = computeGrossAndNet(basicRow, basicLookups)
    expect(r.ratio).toBe(1)
    expect(r.proratedBasic).toBe(5000)
    expect(r.proratedStat).toBe(500)
    expect(r.proratedOt).toBe(200)
    expect(r.statutoryWages).toBe(5500)
    expect(r.gross).toBe(5000 + 500 + 200 + 100 + 300) // 6100
    expect(r.taxableIncome).toBe(6100 - 605)
    expect(r.net).toBe(6100 - 605 - 24.75 - 9.9 - 150)
  })

  it('EPF exempt staff: EPF ER+EE zeroed, SOCSO+EIS untouched', () => {
    const r = computeGrossAndNet(basicRow, { ...basicLookups, isEpfExempt: true })
    expect(r.epfEr).toBe(0)
    expect(r.epfEe).toBe(0)
    expect(r.socsoEe).toBe(24.75)
    expect(r.eisEe).toBe(9.9)
    expect(r.taxableIncome).toBe(r.gross) // no EPF EE to deduct
  })

  it('pro-rata half month (hired mid-April)', () => {
    const row = { ...basicRow, hireDate: '2026-04-16' } // 15 days worked
    const r = computeGrossAndNet(row, basicLookups)
    expect(r.daysWorked).toBe(15)
    expect(r.ratio).toBeCloseTo(0.5, 6)
    expect(r.proratedBasic).toBe(2500) // 5000 * 0.5
    expect(r.proratedStat).toBe(250)
    expect(r.proratedOt).toBe(100)
    // Commission + non_stat are NOT pro-rated
    expect(r.gross).toBeCloseTo(2500 + 250 + 100 + 100 + 300, 2)
  })

  it('commission and non-stat allowance are NOT pro-rated', () => {
    const row = { ...basicRow, hireDate: '2026-04-16', commissionAmount: 1000, nonStatutoryAllowance: 500 }
    const r = computeGrossAndNet(row, basicLookups)
    // prorated: basic 2500 + stat 250 + ot 100 = 2850
    // full: commission 1000 + non-stat 500 = 1500
    // gross = 2850 + 1500 = 4350
    expect(r.gross).toBe(4350)
  })

  it('unpaid leave reduces pro-rata', () => {
    const row = { ...basicRow, unpaidLeaveDays: 15 } // 30 - 15 = 15 effective days
    const r = computeGrossAndNet(row, basicLookups)
    expect(r.daysWorked).toBe(15)
    expect(r.ratio).toBeCloseTo(0.5, 6)
    expect(r.gross).toBeCloseTo(2500 + 250 + 100 + 100 + 300, 2)
  })

  it('zero pro-rata (resigned before period) → all prorated fields 0, commission still full', () => {
    const row = { ...basicRow, resignationDate: '2026-03-15' }
    const r = computeGrossAndNet(row, basicLookups)
    expect(r.daysWorked).toBe(0)
    expect(r.proratedBasic).toBe(0)
    expect(r.proratedStat).toBe(0)
    expect(r.proratedOt).toBe(0)
    // Commission and non-stat still apply (they aren't pro-rated in our model)
    expect(r.gross).toBe(100 + 300)
  })

  it('high-wage RM20K+ EPF: uses pre-looked-up rates (caller computed 12%/11%)', () => {
    const highRow = { ...basicRow, basicSalary: 25000, statutoryAllowance: 0, nonStatutoryAllowance: 0, otAmount: 0, commissionAmount: 0 }
    // At 25000 statutory wages: 12% ER = 3000, 11% EE = 2750
    const r = computeGrossAndNet(highRow, {
      isEpfExempt: false,
      epfLookup: { er: 3000, ee: 2750 },
      socsoLookup: { er: 104.15, ee: 29.75 }, // ceiling
      eisLookup: { er: 9.9, ee: 9.9 }, // ceiling
      pcb: 2500,
    })
    expect(r.gross).toBe(25000)
    expect(r.epfEr).toBe(3000)
    expect(r.epfEe).toBe(2750)
    expect(r.net).toBe(25000 - 2750 - 29.75 - 9.9 - 2500)
  })

  it('PCB = 0 (below threshold) keeps computation correct', () => {
    const lowRow = { ...basicRow, basicSalary: 2000, statutoryAllowance: 0, nonStatutoryAllowance: 0, otAmount: 0, commissionAmount: 0 }
    const r = computeGrossAndNet(lowRow, {
      isEpfExempt: false,
      epfLookup: { er: 260, ee: 220 },
      socsoLookup: { er: 34.15, ee: 9.75 },
      eisLookup: { er: 3.9, ee: 3.9 },
      pcb: 0,
    })
    expect(r.pcb).toBe(0)
    expect(r.net).toBe(2000 - 220 - 9.75 - 3.9 - 0)
  })
})
