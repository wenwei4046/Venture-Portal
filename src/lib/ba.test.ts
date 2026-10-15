import { describe, it, expect } from 'vitest'
import { baLimitWarning, baMissing, baTermsOf, calcBa, daysBetween } from './ba'

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

// The financing form's rules, one for the desktop form and the phone's sheet (2026-10-15).
describe('baTermsOf', () => {
  const f = { face: '100000', bankRatePct: '4.5', startDate: '2026-10-01', endDate: '', days: '90', chargePct: '2.5', hcPct: '1.5' }
  it('days typed: the maturity follows from the start', () => {
    expect(baTermsOf(f)).toMatchObject({ days: 90, maturity: '2026-12-30', chargeToBorrower: 7500, oweToHc: 4500, margin: 3000 })
  })
  it('a maturity date set: the days follow from the dates', () => {
    expect(baTermsOf({ ...f, endDate: '2026-11-30' })).toMatchObject({ days: 60, maturity: '2026-11-30', chargeToBorrower: 5000 })
  })
  it('nothing typed yet is nothing due', () => {
    expect(baTermsOf({ ...f, face: '', days: '' })).toMatchObject({ days: 0, maturity: '', chargeToBorrower: 0 })
  })
})

describe('baLimitWarning', () => {
  const limits = [{ companyId: 'hc', label: 'HOUZS Century (HC)', limit: 100_000, used: 80_000 }]
  it('warns when the face takes the company past its limit', () => {
    expect(baLimitWarning({ companyId: 'hc', face: 30_000, limits, editing: null })).toBe(
      'Over limit: HOUZS Century (HC) has RM 80,000.00 active of RM 100,000.00 — this BA takes it to RM 110,000.00',
    )
    expect(baLimitWarning({ companyId: 'hc', face: 20_000, limits, editing: null })).toBeNull()
  })
  it('an active financing being edited is already inside what is used', () => {
    expect(baLimitWarning({ companyId: 'hc', face: 30_000, limits, editing: { status: 'active', borrowerCompanyId: 'hc', faceAmount: 20_000 } })).toBeNull()
  })
  it('no company, no limit set, no face: no warning', () => {
    expect(baLimitWarning({ companyId: '', face: 1, limits, editing: null })).toBeNull()
    expect(baLimitWarning({ companyId: 'x', face: 1, limits, editing: null })).toBeNull()
    expect(baLimitWarning({ companyId: 'hc', face: 0, limits, editing: null })).toBeNull()
  })
})

describe('baMissing', () => {
  it('names what saving still needs — the face, the days, the ref, a borrower', () => {
    expect(baMissing({ face: 0, days: 0, baNo: ' ', borrowerCompanyId: '', borrowerName: '' })).toEqual(['the face amount', 'the days', 'the BA ref', 'the borrower'])
    expect(baMissing({ face: 1, days: 90, baNo: 'BA-1', borrowerCompanyId: '', borrowerName: 'Acme' })).toEqual([])
  })
})
