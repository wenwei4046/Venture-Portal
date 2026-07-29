import { describe, it, expect } from 'vitest'
import { remainingPeriods, resolveFirstDueYM } from './loan-monitor'

describe('resolveFirstDueYM', () => {
  it('uses the agreed start month when set (that month IS installment #1)', () => {
    expect(resolveFirstDueYM('2026-05-01', '2025-09-02')).toBe('2026-05')
  })
  it('defaults to the month after disbursement when unset', () => {
    expect(resolveFirstDueYM(null, '2026-03-15')).toBe('2026-04')
    expect(resolveFirstDueYM(null, '2026-12-31')).toBe('2027-01')
  })
  it('null when neither exists', () => {
    expect(resolveFirstDueYM(null, null)).toBeNull()
  })
})

describe('remainingPeriods', () => {
  it('counts flat installments consumed by principal repaid', () => {
    expect(remainingPeriods(60000, 6, 0)).toBe(6)
    expect(remainingPeriods(60000, 6, 20000)).toBe(4)
    expect(remainingPeriods(60000, 6, 60000)).toBe(0)
  })
  it('tolerates rounding on the final cent', () => {
    expect(remainingPeriods(100, 3, 33.33)).toBe(2)
  })
})
