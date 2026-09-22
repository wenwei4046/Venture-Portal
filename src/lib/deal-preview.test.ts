import { describe, it, expect } from 'vitest'
import { bankShort, dealPreviewFigures, loanMaturity, numberOrNull } from './deal-preview'

describe('dealPreviewFigures', () => {
  it('flat scheduled plan: principal ÷ months, rate × original principal, whole-life interest', () => {
    expect(dealPreviewFigures({ principal: 100000, monthlyRate: 0.015, months: 12, compounding: false })).toEqual({
      principalPerMonth: 8333.33,
      interestPerMonth: 1500,
      totalPerMonth: 9833.33,
      totalInterest: 18000,
    })
  })

  it("Liang's 60k @ 0.5% × 60 reads 1,000 + 300", () => {
    expect(dealPreviewFigures({ principal: 60000, monthlyRate: 0.005, months: 60, compounding: false })).toEqual({
      principalPerMonth: 1000,
      interestPerMonth: 300,
      totalPerMonth: 1300,
      totalInterest: 18000,
    })
  })

  it('无固定期限: no principal due, the month is interest only, no whole-life figure', () => {
    expect(dealPreviewFigures({ principal: 100000, monthlyRate: 0.015, months: null, compounding: false })).toEqual({
      principalPerMonth: null,
      interestPerMonth: 1500,
      totalPerMonth: 1500,
      totalInterest: null,
    })
  })

  it('compounding: first month shown, whole-life interest left open', () => {
    const f = dealPreviewFigures({ principal: 51000, monthlyRate: 0.04, months: 12, compounding: true })
    expect(f.interestPerMonth).toBe(2040)
    expect(f.totalInterest).toBeNull()
  })

  it('blank or nonsense input renders zeros, never NaN', () => {
    expect(dealPreviewFigures({ principal: NaN, monthlyRate: -1, months: 0, compounding: false })).toEqual({
      principalPerMonth: null,
      interestPerMonth: 0,
      totalPerMonth: 0,
      totalInterest: null,
    })
  })
})

describe('helpers', () => {
  it('numberOrNull', () => {
    expect(numberOrNull('')).toBeNull()
    expect(numberOrNull('  ')).toBeNull()
    expect(numberOrNull('abc')).toBeNull()
    expect(numberOrNull('12')).toBe(12)
    expect(numberOrNull('0.500')).toBe(0.5)
  })

  it('loanMaturity = start + tenure months', () => {
    expect(loanMaturity('2026-09-22', 12)).toBe('2027-09-22')
    expect(loanMaturity('2026-09-22', null)).toBeNull()
    expect(loanMaturity('', 12)).toBeNull()
  })

  it('bankShort keeps the last four digits', () => {
    expect(bankShort('Maybank', '5140 1234 5678')).toBe('Maybank ···5678')
    expect(bankShort('CIMB', '')).toBe('CIMB')
  })
})
