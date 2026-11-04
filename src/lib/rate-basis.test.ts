import { describe, expect, it } from 'vitest'
import { RATE_DECIMALS, monthlyRateOf, rateInBasis, rateWords } from './rate-basis'

// 2026-11-04 — the user: "有没有办法我也可以set annual的？" → annual ÷ 12, charged and compounded monthly; the worry
// "类似10% per annum": stored at six decimals, 10% ÷ 12 bore 999.96 a month on 120,000 instead of 1,000.00.

describe('a rate per year', () => {
  it('becomes the month’s rate to ten decimals, so a month’s interest lands on the sen', () => {
    const monthly = monthlyRateOf(10, 'year')
    expect(monthly).toBe(0.0083333333)
    expect(Math.round(120000 * monthly * 100) / 100).toBe(1000)
    expect(Math.round(300000 * monthly * 100) / 100).toBe(2500)
    expect(RATE_DECIMALS).toBe(10)
  })

  it('a rate per month is kept as typed', () => {
    expect(monthlyRateOf(0.5, 'month')).toBe(0.005)
    expect(monthlyRateOf(0.5556, 'month')).toBe(0.005556)
  })

  it('is shown the way it was agreed, the month’s beside it', () => {
    expect(rateWords(0.0083333333, 'year')).toBe('10.000% /yr · 0.833% /mo')
    expect(rateWords(0.005, 'month')).toBe('0.500% /mo')
    expect(rateInBasis(0.0083333333, 'year')).toBe(10)
    expect(rateInBasis(0.005, 'month')).toBe(0.5)
  })
})
