import { describe, expect, it } from 'vitest'
import { defaultStart, fundSourceStart, loanStart, repaymentStart } from './repayment-start'

// 2026-10-12 (user: 现在只能选月份不能选日期 → expected repayment 和 repayment
// start date 应该要一样): a deal's repayment start is a date — its first
// instalment's, every later one on the same day of the month. Unpicked, it is
// the month after the money moved, on that day.

describe('a deal’s repayment start', () => {
  it('is the date Finance picked, its day every instalment’s', () => {
    expect(repaymentStart('2026-10-14', '2026-10-01', '2026-09-14')).toEqual({ date: '2026-10-14', day: 14, set: true })
    expect(repaymentStart('2026-10-07', '2026-10-01', '2026-09-14')).toEqual({ date: '2026-10-07', day: 7, set: true })
  })

  it('unpicked, is the month after the money moved, on that day', () => {
    expect(repaymentStart(null, null, '2026-07-15')).toEqual({ date: '2026-08-15', day: 15, set: false })
    expect(defaultStart('2026-09-14')).toBe('2026-10-14')
    expect(defaultStart(null)).toBeNull()
  })

  it('reads a month set before dates could be picked on the money’s day', () => {
    expect(repaymentStart(null, '2026-05-01', '2025-09-02')).toEqual({ date: '2026-05-02', day: 2, set: true })
  })

  it('keeps a date that is not in the start month as a note, not the start', () => {
    // An early record's expected repayment, from before its month was the start.
    expect(repaymentStart('2026-08-20', null, '2026-07-15')).toEqual({ date: '2026-08-15', day: 15, set: false })
    expect(repaymentStart('2026-07-31', '2026-09-01', '2026-07-15')).toEqual({ date: '2026-09-15', day: 15, set: true })
  })

  it('falls on a short month’s last day', () => {
    expect(repaymentStart(null, null, '2026-01-31')).toEqual({ date: '2026-02-28', day: 31, set: false })
  })

  it('has no date with nothing to go by', () => {
    expect(repaymentStart(null, null, null)).toEqual({ date: null, day: 1, set: false })
  })

  it('reads a fund source by its expected repayment and effective date, a loan by its start date and disbursement', () => {
    expect(fundSourceStart({ repayment_date: '2026-10-07', repayment_start_month: '2026-10-01', effective_date: '2026-09-14' })).toMatchObject({ date: '2026-10-07', day: 7 })
    expect(loanStart({ repayment_start_date: '2026-05-20', repayment_start_month: '2026-05-01', disbursement_date: '2025-09-02' })).toMatchObject({ date: '2026-05-20', day: 20 })
    expect(loanStart({ repayment_start_month: null, disbursement_date: '2026-04-10' })).toMatchObject({ date: '2026-05-10', day: 10, set: false })
  })
})
