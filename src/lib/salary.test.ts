import { describe, it, expect } from 'vitest'
import {
  calculatePool,
  calculateDirectorPayout,
  type CTCRecord,
  type DirectorConfig,
  type StatutoryLookup,
} from './salary'

// ─── Test data from module-spec-phase3.md ──────────────────────────
// WL example: basic 60,100 + kpi 0 + allowance 23,805.60
// Pool = 83,905.60, 4 directors, weightages sum to 4.0

const testCTCRecords: CTCRecord[] = [
  // WL — 4 companies contributing
  { directorId: 'wl', companyId: 'houzs', basic: 22800, kpi: 0, allowance: 14469.90, employerEpf: 2736, employerSocso: 104.15, employerEis: 9.90, totalCtc: 40119.95 },
  { directorId: 'wl', companyId: 'conts', basic: 17400, kpi: 0, allowance: 9335.70, employerEpf: 2088, employerSocso: 104.15, employerEis: 9.90, totalCtc: 28937.75 },
  { directorId: 'wl', companyId: 'dc', basic: 17400, kpi: 0, allowance: 0, employerEpf: 2088, employerSocso: 104.15, employerEis: 9.90, totalCtc: 19602.05 },
  { directorId: 'wl', companyId: '2990', basic: 2500, kpi: 0, allowance: 0, employerEpf: 325, employerSocso: 42.85, employerEis: 4.90, totalCtc: 2872.75 },
]

const testDirectors: DirectorConfig[] = [
  { id: 'wl', code: 'WL', weightage: 0.85, minPayout: 14400, pcbCategory: 'KA1', childrenCount: 0 },
  { id: 'mk', code: 'MK', weightage: 0.945, minPayout: 14400, pcbCategory: 'KA1', childrenCount: 0 },
  { id: 'ws', code: 'WS', weightage: 1.05, minPayout: 14400, pcbCategory: 'KA1', childrenCount: 0 },
  { id: 'ww', code: 'WW', weightage: 1.155, minPayout: 14400, pcbCategory: 'KA1', childrenCount: 0 },
]

describe('salary.ts — calculatePool', () => {
  it('computes pool from CTC records matching spec', () => {
    const pool = calculatePool(testCTCRecords)

    expect(pool.totalBasic).toBe(60100)
    expect(pool.totalKpi).toBe(0)
    expect(pool.totalAllowance).toBe(23805.60)
    expect(pool.totalPool).toBe(83905.60)

    // Ratios from spec: basic 71.63% / allowance 28.37%
    expect(pool.basicRatio).toBeCloseTo(0.7163, 3)
    expect(pool.allowanceRatio).toBeCloseTo(0.2837, 3)
    expect(pool.kpiRatio).toBe(0)
  })

  it('computes total statutory ER IN', () => {
    const pool = calculatePool(testCTCRecords)
    // Total ER IN = sum of all EPF ER + SOCSO ER + EIS ER
    const expectedErIn = (2736 + 2088 + 2088 + 325) + (104.15 + 104.15 + 104.15 + 42.85) + (9.90 + 9.90 + 9.90 + 4.90)
    expect(pool.totalStatutoryErIn).toBeCloseTo(expectedErIn, 1)
  })
})

describe('salary.ts — calculateDirectorPayout', () => {
  const pool = calculatePool(testCTCRecords)
  const totalWeightage = testDirectors.reduce((s, d) => s + d.weightage, 0) // 4.0
  const savingRate = 0.05

  it('computes WL gross matching spec (RM17,829.94)', () => {
    const payrollStat: StatutoryLookup = {
      epfEr: 1248, epfEe: 1144,
      socsoEr: 104.15, socsoEe: 29.75,
      eisEr: 9.90, eisEe: 9.90,
    }
    const invoiceStat: StatutoryLookup = {
      epfEr: 396, socsoEr: 53.35, eisEr: 6.10,
      epfEe: 0, socsoEe: 0, eisEe: 0,
    }

    const payout = calculateDirectorPayout(
      testDirectors[0], pool, totalWeightage, savingRate,
      payrollStat, invoiceStat, 0
    )

    // Spec values for WL
    expect(payout.grossAmount).toBeCloseTo(17829.94, 0)
    expect(payout.savingAmount).toBeCloseTo(891.50, 0)
    expect(payout.afterSaving).toBeCloseTo(16938.44, 0)
  })

  it('computes WL payroll with advance (below min payout)', () => {
    const payrollStat: StatutoryLookup = {
      epfEr: 1248, epfEe: 1144,
      socsoEr: 104.15, socsoEe: 29.75,
      eisEr: 9.90, eisEe: 9.90,
    }
    const invoiceStat: StatutoryLookup = {
      epfEr: 396, socsoEr: 53.35, eisEr: 6.10,
      epfEe: 0, socsoEe: 0, eisEe: 0,
    }

    const payout = calculateDirectorPayout(
      testDirectors[0], pool, totalWeightage, savingRate,
      payrollStat, invoiceStat, 0
    )

    // 75% of after_saving = 16938.44 * 0.75 = 12703.83
    expect(payout.payrollCalc).toBeCloseTo(12703.83, 0)

    // Below min payout 14400 → advance needed
    expect(payout.advanceAmount).toBeGreaterThan(0)
    expect(payout.payrollGross).toBe(14400)
  })

  it('computes MK gross (RM19,822.70)', () => {
    const payrollStat: StatutoryLookup = {
      epfEr: 1728, epfEe: 1584,
      socsoEr: 104.15, socsoEe: 29.75,
      eisEr: 9.90, eisEe: 9.90,
    }
    const invoiceStat: StatutoryLookup = {
      epfEr: 500, socsoEr: 53.35, eisEr: 6.10,
      epfEe: 0, socsoEe: 0, eisEe: 0,
    }

    const payout = calculateDirectorPayout(
      testDirectors[1], pool, totalWeightage, savingRate,
      payrollStat, invoiceStat, 0
    )

    expect(payout.grossAmount).toBeCloseTo(19822.70, 0)
    expect(payout.savingAmount).toBeCloseTo(991.13, 0)
  })

  it('WS and WW do not need advance (above min payout)', () => {
    const stat: StatutoryLookup = {
      epfEr: 2000, epfEe: 1800,
      socsoEr: 104.15, socsoEe: 29.75,
      eisEr: 9.90, eisEe: 9.90,
    }
    const invStat: StatutoryLookup = {
      epfEr: 600, socsoEr: 53.35, eisEr: 6.10,
      epfEe: 0, socsoEe: 0, eisEe: 0,
    }

    const payoutWS = calculateDirectorPayout(
      testDirectors[2], pool, totalWeightage, savingRate,
      stat, invStat, 0
    )
    const payoutWW = calculateDirectorPayout(
      testDirectors[3], pool, totalWeightage, savingRate,
      stat, invStat, 0
    )

    // WS: gross = 83905.60 * 1.05 / 4.0 = 22025.22
    expect(payoutWS.grossAmount).toBeCloseTo(22025.22, 0)
    // WW: gross = 83905.60 * 1.155 / 4.0 = 24227.74
    expect(payoutWW.grossAmount).toBeCloseTo(24227.74, 0)

    // Both should have payroll_calc > 14400 → no advance
    expect(payoutWS.advanceAmount).toBe(0)
    expect(payoutWW.advanceAmount).toBe(0)
  })

  it('total saving matches spec (RM4,195.28)', () => {
    const stat: StatutoryLookup = {
      epfEr: 1500, epfEe: 1375,
      socsoEr: 104.15, socsoEe: 29.75,
      eisEr: 9.90, eisEe: 9.90,
    }
    const invStat: StatutoryLookup = {
      epfEr: 500, socsoEr: 53.35, eisEr: 6.10,
      epfEe: 0, socsoEe: 0, eisEe: 0,
    }

    let totalSaving = 0
    for (const d of testDirectors) {
      const p = calculateDirectorPayout(d, pool, totalWeightage, savingRate, stat, invStat, 0)
      totalSaving += p.savingAmount
    }
    expect(totalSaving).toBeCloseTo(4195.28, 0)
  })
})

describe('salary.ts — advance offset from allowance (Phase 3 spec)', () => {
  const pool = calculatePool(testCTCRecords)
  const totalWeightage = testDirectors.reduce((s, d) => s + d.weightage, 0)
  const savingRate = 0.05
  const stat: StatutoryLookup = {
    epfEr: 1248, epfEe: 1144,
    socsoEr: 104.15, socsoEe: 29.75,
    eisEr: 9.90, eisEe: 9.90,
  }
  const invStat: StatutoryLookup = {
    epfEr: 396, socsoEr: 53.35, eisEr: 6.10,
    epfEe: 0, socsoEe: 0, eisEe: 0,
  }

  it('with 0 opening balance matches legacy behaviour', () => {
    const payout = calculateDirectorPayout(
      testDirectors[0], pool, totalWeightage, savingRate, stat, invStat, 0, 0
    )
    expect(payout.advanceRepaid).toBe(0)
    expect(payout.advanceOpeningBalance).toBe(0)
    expect(payout.advanceBalance).toBe(payout.advanceAmount)
  })

  it('repays fully from allowance when allowance >= balance', () => {
    // Spec example: advance 6,000, allowance (post-saving) >= 6,000 → full repay
    const openingBalance = 500  // small balance, well within WS allowance
    const payout = calculateDirectorPayout(
      testDirectors[2], pool, totalWeightage, savingRate, stat, invStat, 0, openingBalance
    )
    expect(payout.advanceRepaid).toBe(500)
    expect(payout.advanceBalance).toBe(payout.advanceAmount) // opening - repaid = 0, plus any new top-up
  })

  it('caps repay at allowance share when balance > allowance', () => {
    // Huge opening balance — only allowance share gets repaid this month
    const pool2 = calculatePool(testCTCRecords)
    const allowanceShare = Math.round(
      Math.round(pool2.totalPool * 1.05 / 4.0 * 0.95 * 100) / 100 * pool2.allowanceRatio * 100
    ) / 100
    const payout = calculateDirectorPayout(
      testDirectors[2], pool2, totalWeightage, savingRate, stat, invStat, 0, 999999
    )
    expect(payout.advanceRepaid).toBeCloseTo(allowanceShare, 0)
    expect(payout.advanceBalance).toBeGreaterThan(0) // still owing next month
  })

  it('never touches basic+KPI when allowance < balance', () => {
    const payout = calculateDirectorPayout(
      testDirectors[0], pool, totalWeightage, savingRate, stat, invStat, 0, 999999
    )
    // Leftover after offset = basic+kpi share only (allowance fully consumed)
    const allowanceShare = Math.round(payout.afterSaving * pool.allowanceRatio * 100) / 100
    const bkShare = Math.round((payout.afterSaving - allowanceShare) * 100) / 100
    // payroll_calc = bkShare × 75% (or bumped to min if below)
    expect(payout.payrollCalc).toBeCloseTo(Math.round(bkShare * 0.75 * 100) / 100, 0)
  })

  it('offset can trigger new top-up when leftover falls below min (Q4 option i)', () => {
    // WL gross is small enough that full offset pushes payroll_calc below min
    const openingBalance = 10000
    const payout = calculateDirectorPayout(
      testDirectors[0], pool, totalWeightage, savingRate, stat, invStat, 0, openingBalance
    )
    // After offset + 75/25: payroll_calc may be < min → advance_amount > 0
    // Closing balance = opening - repaid + new_top_up
    const expectedBalance =
      Math.round((openingBalance - payout.advanceRepaid + payout.advanceAmount) * 100) / 100
    expect(payout.advanceBalance).toBe(expectedBalance)
  })
})

describe('salary.ts — edge cases', () => {
  it('handles zero pool gracefully', () => {
    const pool = calculatePool([])
    expect(pool.totalPool).toBe(0)
    expect(pool.basicRatio).toBe(0)
    expect(pool.allowanceRatio).toBe(0)
  })

  it('handles saving rate of 0', () => {
    const pool = calculatePool(testCTCRecords)
    const totalW = 4.0
    const stat: StatutoryLookup = {
      epfEr: 1000, epfEe: 900,
      socsoEr: 100, socsoEe: 28,
      eisEr: 9, eisEe: 9,
    }
    const invStat: StatutoryLookup = {
      epfEr: 400, socsoEr: 50, eisEr: 5,
      epfEe: 0, socsoEe: 0, eisEe: 0,
    }

    const payout = calculateDirectorPayout(
      testDirectors[0], pool, totalW, 0, // saving rate = 0
      stat, invStat, 0
    )
    expect(payout.savingAmount).toBe(0)
    expect(payout.afterSaving).toBe(payout.grossAmount)
  })
})

// ─── Fully Paid mode (mig 281 R5; redefined 2026-07-13) ─────────────
// Staff-style payout: NO saving, no 75/25 — 100% of gross (post
// advance-offset) pays as ONE standard payroll. Invoice side fully
// zeroed — nothing accumulates into invoice_payout_pool. Statutory
// still keyed on B+K only.

describe('salary.ts — fully_paid mode', () => {
  const pool = calculatePool(testCTCRecords)
  const totalWeightage = 4.0
  const savingRate = 0.05
  const payrollStat: StatutoryLookup = {
    epfEr: 1248, epfEe: 1144,
    socsoEr: 104.15, socsoEe: 29.75,
    eisEr: 9.90, eisEe: 9.90,
  }
  // Engine must IGNORE invoice statutory in fully_paid — pass non-zero
  // values on purpose to prove they cannot leak into the result.
  const poisonInvoiceStat: StatutoryLookup = {
    epfEr: 396, socsoEr: 53.35, eisEr: 6.10,
    epfEe: 0, socsoEe: 0, eisEe: 0,
  }

  it('pays 100% of after-offset as payroll, zero invoice', () => {
    const payout = calculateDirectorPayout(
      testDirectors[0], pool, totalWeightage, savingRate,
      payrollStat, poisonInvoiceStat, 0, 0, 'fully_paid'
    )

    // No saving at all — staff-style: 100% of gross flows to payroll
    expect(payout.grossAmount).toBeCloseTo(17829.94, 0)
    expect(payout.savingAmount).toBe(0)
    expect(payout.afterSaving).toBeCloseTo(17829.94, 0)

    // 100% of gross is payroll (no advance offset here)
    expect(payout.payrollCalc).toBeCloseTo(17829.94, 1)
    expect(payout.payrollGross).toBeCloseTo(17829.94, 1) // above min 14400 → no top-up
    expect(payout.advanceAmount).toBe(0)

    // Invoice side fully zeroed despite poisoned lookup values
    expect(payout.invoiceBase).toBe(0)
    expect(payout.invoiceBk).toBe(0)
    expect(payout.invoiceEpfEr).toBe(0)
    expect(payout.invoiceSocsoEr).toBe(0)
    expect(payout.invoiceEisEr).toBe(0)
    expect(payout.invoiceTotal).toBe(0)

    expect(payout.mode).toBe('fully_paid')
  })

  it('keeps B+K-with-statutory / Allowance-without composition', () => {
    const payout = calculateDirectorPayout(
      testDirectors[0], pool, totalWeightage, savingRate,
      payrollStat, poisonInvoiceStat, 0, 0, 'fully_paid'
    )

    // payroll_bk + payroll_allow foot to payroll_gross; the BK share is what
    // statutory lookups are keyed on (orchestrator passes B+K wages only).
    expect(payout.payrollBk + payout.payrollAllow).toBeCloseTo(payout.payrollGross, 1)
    expect(payout.payrollBk).toBeCloseTo(payout.payrollGross * pool.basicRatio, 0)

    // Net = gross − all payroll statutory (ER+EE) − PCB
    const expectedNet =
      payout.payrollGross
      - payrollStat.epfEr - payrollStat.epfEe
      - payrollStat.socsoEr - payrollStat.socsoEe
      - payrollStat.eisEr - payrollStat.eisEe
      - payout.payrollPcb
    expect(payout.payrollNet).toBeCloseTo(expectedNet, 1)
  })

  it('statutory surplus counts payroll ER only (no invoice ER out)', () => {
    const payout = calculateDirectorPayout(
      testDirectors[0], pool, totalWeightage, savingRate,
      payrollStat, poisonInvoiceStat, 0, 0, 'fully_paid'
    )
    const expectedOut = payrollStat.epfEr + payrollStat.socsoEr + payrollStat.eisEr
    expect(payout.statutoryErOut).toBeCloseTo(expectedOut, 1)
  })

  it('still applies the allowance → advance offset before paying out', () => {
    const openingBalance = 2000
    const payout = calculateDirectorPayout(
      testDirectors[0], pool, totalWeightage, savingRate,
      payrollStat, poisonInvoiceStat, 0, openingBalance, 'fully_paid'
    )
    expect(payout.advanceRepaid).toBeGreaterThan(0)
    expect(payout.advanceRepaid).toBeLessThanOrEqual(openingBalance)
    // payroll = gross − advanceRepaid (no saving, 100% of after-offset)
    expect(payout.savingAmount).toBe(0)
    expect(payout.payrollCalc).toBeCloseTo(payout.grossAmount - payout.advanceRepaid, 1)
  })

  it('defaults to split mode when mode arg omitted (back-compat)', () => {
    const payout = calculateDirectorPayout(
      testDirectors[0], pool, totalWeightage, savingRate,
      payrollStat, poisonInvoiceStat, 0, 0
    )
    expect(payout.mode).toBe('split')
    expect(payout.payrollCalc).toBeCloseTo(payout.afterSaving * 0.75, 1)
    expect(payout.invoiceBase).toBeCloseTo(payout.afterSaving * 0.25, 1)
    expect(payout.invoiceTotal).toBeGreaterThan(0)
  })
})
