import { describe, it, expect } from 'vitest'
import { expectedFullRepaymentDate, monthsBetween } from './fund-source-dates'

describe('expectedFullRepaymentDate', () => {
  it('adds lock_in_months to the first-installment date', () => {
    // First installment 2026-06-01, 12-month repayment period → fully repaid 2027-05-01
    // (12 installments: Jun 2026 ... May 2027)
    expect(expectedFullRepaymentDate('2026-06-01', 12)).toBe('2027-05-01')
  })
  it('handles a 1-month period (single installment = first installment)', () => {
    expect(expectedFullRepaymentDate('2026-06-15', 1)).toBe('2026-06-15')
  })
  it('handles month-end rollover', () => {
    // Jan 31 + 1 installment after = dayjs clamps to last day of Feb
    expect(expectedFullRepaymentDate('2026-01-31', 2)).toBe('2026-02-28')
  })
})

describe('monthsBetween', () => {
  it('counts whole months from effective date to first repayment', () => {
    expect(monthsBetween('2026-01-01', '2026-04-01')).toBe(3)
  })
})
