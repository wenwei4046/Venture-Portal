import { describe, expect, it } from 'vitest'
import { checkDirectorPay, directorIncentiveEarned, monthCommissionableValue, needsMonthValue } from './director-pay'

describe('the month figure the incentive is judged on', () => {
  it('is Comm Cal’s Commissionable value card: every live bill, cancelled ones out', () => {
    expect(monthCommissionableValue([
      { cancelled: false, marginRevenue: 1_000.005 },
      { cancelled: false, marginRevenue: 2_500 },
      { cancelled: true, marginRevenue: 99_999 },
    ])).toBe(3_500.01)
    expect(monthCommissionableValue([])).toBe(0)
  })
})

describe('the incentive', () => {
  const terms = { salesThreshold: 2_000_000, incentiveAmount: 5_000 }

  it('is paid once the month reaches the threshold, not a sen before', () => {
    expect(directorIncentiveEarned(terms, 2_000_000)).toBe(true)
    expect(directorIncentiveEarned(terms, 2_100_000)).toBe(true)
    expect(directorIncentiveEarned(terms, 1_999_999.99)).toBe(false)
  })

  it('is never paid without a threshold, an amount, or the month figure', () => {
    expect(directorIncentiveEarned({ ...terms, salesThreshold: null }, 5_000_000)).toBe(false)
    expect(directorIncentiveEarned({ ...terms, incentiveAmount: 0 }, 5_000_000)).toBe(false)
    expect(directorIncentiveEarned(terms, null)).toBe(false)
    expect(directorIncentiveEarned(terms, undefined)).toBe(false)
  })

  it('asks for the month figure only when some director has an incentive to judge', () => {
    expect(needsMonthValue([])).toBe(false)
    expect(needsMonthValue([{ salesThreshold: null, incentiveAmount: 0 }])).toBe(false)
    expect(needsMonthValue([{ salesThreshold: 2_000_000, incentiveAmount: 0 }])).toBe(false)
    expect(needsMonthValue([{ salesThreshold: null, incentiveAmount: 0 }, terms])).toBe(true)
  })
})

describe('a row of Rules › Directors as typed', () => {
  it('stores blanks as nothing: no fixed amount, no incentive', () => {
    expect(checkDirectorPay({ fixedAmount: null, salesThreshold: null, incentiveAmount: null }))
      .toEqual({ fixedAmount: 0, salesThreshold: null, incentiveAmount: 0 })
    expect(checkDirectorPay({ fixedAmount: 38_000, salesThreshold: 2_000_000, incentiveAmount: 5_000 }))
      .toEqual({ fixedAmount: 38_000, salesThreshold: 2_000_000, incentiveAmount: 5_000 })
  })

  it('refuses in words what the table would refuse', () => {
    expect(() => checkDirectorPay({ fixedAmount: -1, salesThreshold: null, incentiveAmount: null })).toThrow('cannot be below zero')
    expect(() => checkDirectorPay({ fixedAmount: 1.005, salesThreshold: null, incentiveAmount: null })).toThrow('to the sen')
    expect(() => checkDirectorPay({ fixedAmount: 0, salesThreshold: 0, incentiveAmount: 0 })).toThrow('more than zero')
    expect(() => checkDirectorPay({ fixedAmount: 0, salesThreshold: null, incentiveAmount: 5_000 })).toThrow('fill in the threshold')
  })
})
