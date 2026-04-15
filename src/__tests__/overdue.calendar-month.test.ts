import { describe, it, expect } from 'vitest'
import dayjs from 'dayjs'

// Phase 7 Step 12 — boundary checks for the calendar-month overdue rule.
// The actual detectOverdue action is integration-tested via scripts/step12-e2e.mjs
// against real DB. Here we lock in the date-math boundaries as pure logic.

function isPeriodOverdue(params: {
  now: string
  periodStart: string
  expectedInterest: number
  paidInPeriod: number
  outstanding: number
  disbursementDate: string
}): boolean {
  const now = dayjs(params.now)
  const periodEnd = dayjs(params.periodStart).endOf('month')
  if (!now.isAfter(periodEnd, 'day')) return false
  if (dayjs(params.disbursementDate).isAfter(periodEnd, 'day')) return false
  if (params.outstanding <= 0) return false
  if (params.paidInPeriod >= params.expectedInterest) return false
  return true
}

describe('Phase 7 Step 12 — calendar-month overdue rule', () => {
  const march = {
    periodStart: '2026-03-01',
    expectedInterest: 1500,
    disbursementDate: '2026-03-15',
    outstanding: 100000,
  }

  it('NOT overdue when still inside the period (last day of month)', () => {
    expect(
      isPeriodOverdue({ ...march, now: '2026-03-31', paidInPeriod: 0 })
    ).toBe(false)
  })

  it('overdue the next day after month-end, if unpaid', () => {
    expect(
      isPeriodOverdue({ ...march, now: '2026-04-01', paidInPeriod: 0 })
    ).toBe(true)
  })

  it('NOT overdue when interest was fully paid in the period', () => {
    expect(
      isPeriodOverdue({ ...march, now: '2026-04-05', paidInPeriod: 1500 })
    ).toBe(false)
  })

  it('overdue when partial payment < expected interest', () => {
    expect(
      isPeriodOverdue({ ...march, now: '2026-04-05', paidInPeriod: 1499.99 })
    ).toBe(true)
  })

  it('NOT overdue when outstanding is zero (loan repaid)', () => {
    expect(
      isPeriodOverdue({ ...march, now: '2026-04-05', paidInPeriod: 0, outstanding: 0 })
    ).toBe(false)
  })

  it('NOT overdue for loans disbursed after period end', () => {
    expect(
      isPeriodOverdue({
        ...march,
        disbursementDate: '2026-04-02',
        now: '2026-05-03',
        paidInPeriod: 0,
      })
    ).toBe(false)
  })
})
