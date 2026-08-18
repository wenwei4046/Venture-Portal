import { describe, it, expect } from 'vitest'
import { calculateDirectorGap, type GapInput } from './director-gap'

// July 2026 — the real period. Expected figures were taken from the
// /director-pool engine (calcAll) run over the live dp_* data, so this test
// pins the gap module to the calculator it is meant to mirror.
const JULY: GapInput = {
  poolBasic: 50900.0,
  poolKpi: 15793.87,
  poolAllowance: 5414.25,
  ctcEmployerStat: 8036.0 + 459.45 + 52.5, // 8,547.95
  payrollGross: 57933.47,
  payrollEmployerStat: 7376.2,
  settings: { savingPct: 5, gbPct: 75 },
  directors: [
    { code: 'MK', weightage: 0.945, minPayout: 14400 },
    { code: 'WL', weightage: 0.85, minPayout: 14400 },
    { code: 'WS', weightage: 1.05, minPayout: 14400 },
    { code: 'WW', weightage: 1.155, minPayout: 14400 },
  ],
}

describe('calculateDirectorGap', () => {
  it('matches the director-pool engine per director (July 2026)', () => {
    const r = calculateDirectorGap(JULY)!
    const by = Object.fromEntries(r.perDirector.map(d => [d.code, d]))

    // Engine output, verbatim.
    expect(by.WL.salKpiGross).toBe(14172.45)
    expect(by.WL.allowGross).toBe(1150.53)
    expect(by.WL.saving).toBe(766.15)
    expect(by.WL.totalPay).toBe(10917.62)
    expect(by.WL.billing25).toBe(3639.21)
    expect(by.WL.vrKpi).toBe(-3482.38)

    expect(by.MK.totalPay).toBe(12137.83)
    expect(by.MK.vrKpi).toBe(-2262.17)
    expect(by.WS.totalPay).toBe(13486.48)
    expect(by.WS.vrKpi).toBe(-913.52)

    // WW is the only director whose share clears the fixed salary.
    expect(by.WW.totalPay).toBe(14835.12)
    expect(by.WW.vrKpi).toBe(435.12)
  })

  it('splits the July gap into the four buckets', () => {
    const r = calculateDirectorGap(JULY)!

    expect(r.ctcGross).toBe(72108.12)
    expect(r.ctcTotal).toBe(80656.07)
    expect(r.cashOut).toBe(65309.67)
    expect(r.gap).toBe(15346.4)

    expect(r.saving).toBe(3605.41)
    expect(r.billing25).toBe(17125.69)
    expect(r.totalPay75).toBe(51377.05)
    expect(r.statutorySurplus).toBe(1171.75)
  })

  it('keeps the two advance views distinct', () => {
    const r = calculateDirectorGap(JULY)!

    // Cash: payroll actually paid vs what the pool's 75% supports.
    expect(r.advanceCash).toBe(6556.42)
    // Ledger: only the three directors who fell short (WW excluded).
    expect(r.advanceLedger).toBe(6658.07)
  })

  it('tallies — the four buckets reconstruct the gap', () => {
    const r = calculateDirectorGap(JULY)!
    const rebuilt = r.saving + r.billing25 - r.advanceCash + r.statutorySurplus

    expect(rebuilt).toBeCloseTo(r.gap, 1)
    expect(Math.abs(r.residual)).toBeLessThan(0.1)
  })

  it('handles a full-allowance month without drifting (June 2026)', () => {
    const r = calculateDirectorGap({
      ...JULY,
      poolKpi: 7179.55,
      poolAllowance: 9527.04,
      ctcEmployerStat: 7009.0 + 459.45 + 52.5,
      payrollGross: 57600.0,
      payrollEmployerStat: 7376.2,
    })!

    expect(r.ctcGross).toBe(67606.59)
    expect(r.saving).toBe(3380.34)
    expect(r.billing25).toBe(16056.57)
    expect(r.totalPay75).toBe(48169.71)
    // Every director fell short in June, so both views agree.
    expect(r.advanceCash).toBe(9430.29)
    expect(r.advanceLedger).toBe(9430.29)
    expect(Math.abs(r.residual)).toBeLessThan(0.1)
  })

  it('returns null when there is no pool or no weightage', () => {
    expect(calculateDirectorGap({ ...JULY, poolBasic: 0, poolKpi: 0, poolAllowance: 0 })).toBeNull()
    expect(calculateDirectorGap({ ...JULY, directors: [] })).toBeNull()
  })
})
