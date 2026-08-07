import { describe, it, expect } from 'vitest'
import { calcBa, daysBetween } from './ba'

describe('calcBa', () => {
  it('100k @ bank 4.5%/yr, 90 days, charge 2.5%/mo, HC 1.5%/mo', () => {
    const r = calcBa({
      face: 100_000,
      bankAnnualRate: 0.045,
      days: 90,
      chargeRateMonthly: 0.025,
      hcRateMonthly: 0.015,
    })
    expect(r.bankInterest).toBe(1109.59) // 100,000 × 0.045 × 90/365
    expect(r.chargeToBorrower).toBe(7500) // 100,000 × 0.025 × 90/30
    expect(r.oweToHc).toBe(4500) // 100,000 × 0.015 × 90/30
    expect(r.margin).toBe(3000)
    expect(r.collectTotal).toBe(107_500)
    expect(r.repayHcTotal).toBe(104_500)
  })

  it('prorates odd tenors by days (61 days)', () => {
    const r = calcBa({
      face: 50_000,
      bankAnnualRate: 0.05,
      days: 61,
      chargeRateMonthly: 0.025,
      hcRateMonthly: 0.015,
    })
    expect(r.chargeToBorrower).toBe(2541.67) // 50,000 × 0.025 × 61/30
    expect(r.oweToHc).toBe(1525) // 50,000 × 0.015 × 61/30
    expect(r.margin).toBe(1016.67)
    expect(r.bankInterest).toBe(417.81) // 50,000 × 0.05 × 61/365
  })

  it('zero/negative inputs collapse to zero, never NaN', () => {
    const r = calcBa({ face: 0, bankAnnualRate: 0.05, days: -3, chargeRateMonthly: 0.025, hcRateMonthly: 0.015 })
    expect(r.bankInterest).toBe(0)
    expect(r.chargeToBorrower).toBe(0)
    expect(r.collectTotal).toBe(0)
  })
})

describe('daysBetween', () => {
  it('counts calendar days across months', () => {
    expect(daysBetween('2026-08-07', '2026-11-05')).toBe(90)
    expect(daysBetween('2026-08-07', '2026-08-07')).toBe(0)
  })
  it('never negative and tolerates bad input', () => {
    expect(daysBetween('2026-08-07', '2026-08-01')).toBe(0)
    expect(daysBetween('garbage', '2026-08-01')).toBe(0)
  })
})
