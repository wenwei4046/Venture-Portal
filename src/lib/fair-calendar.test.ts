import { describe, it, expect } from 'vitest'
import { saleMonthOf, sortFairs, type Fair } from './fair-calendar'

/**
 * The Kuching fair ran 28–31 August 2026 and its bills reached the ERP between
 * 1 and 16 September — the August reconciliation's numbers, not invented ones.
 */

function fair(over: Partial<Fair> = {}): Fair {
  return {
    fairId: 'f1',
    venueKey: 'BORNEO CONVENTION CENTRE KUCHING',
    displayName: 'Borneo Convention Centre Kuching',
    periodMonth: '2026-08-01',
    startDate: '2026-08-28',
    endDate: '2026-08-31',
    organiserId: 'o1',
    organiserName: 'HOMELOVE',
    erpOrganiserText: null,
    source: 'manual',
    notes: null,
    bills: 31,
    total: 203339,
    billsToMove: 30,
    valueToMove: 199339,
    confirmedToMove: 0,
    confirmedValueToMove: 0,
    ...over,
  }
}

describe('sortFairs', () => {
  it('puts the newest fair first and ranks an undated row on its month', () => {
    const rows = [
      fair({ fairId: 'a', startDate: '2026-08-07', endDate: '2026-08-09' }),
      fair({ fairId: 'b', startDate: '2026-08-28', endDate: '2026-08-31' }),
      fair({ fairId: 'c', startDate: null, endDate: null, periodMonth: '2026-09-01' }),
    ]
    expect(sortFairs(rows).map(f => f.fairId)).toEqual(['c', 'b', 'a'])
  })

  it('does not mutate what it was given', () => {
    const rows = [
      fair({ fairId: 'a', startDate: '2026-08-07', endDate: '2026-08-09' }),
      fair({ fairId: 'b', startDate: '2026-08-28', endDate: '2026-08-31' }),
    ]
    sortFairs(rows)
    expect(rows.map(f => f.fairId)).toEqual(['a', 'b'])
  })

  it('breaks a tie on the venue name', () => {
    const rows = [
      fair({ fairId: 'z', displayName: 'Zanotti Living' }),
      fair({ fairId: 'a', displayName: 'Arena' }),
    ]
    expect(sortFairs(rows).map(f => f.fairId)).toEqual(['a', 'z'])
  })
})

// 2026-10-12: the TS twin of sales_order_sale_month() — a ledger row keyed in
// another month than its fair's says so (Late key-in).
describe('saleMonthOf', () => {
  const crossing = fair({ periodMonth: '2026-09-01', startDate: '2026-09-30', endDate: '2026-10-02' })
  it('is the month of the day sold, when that day is one of the fair’s', () => {
    expect(saleMonthOf('2026-09-30', crossing)).toBe('2026-09-01')
    expect(saleMonthOf('2026-10-01', crossing)).toBe('2026-10-01')
    expect(saleMonthOf('2026-10-02T00:00:00', crossing)).toBe('2026-10-01')
  })
  it('is the fair’s own month for a day off its days, no day, or one that does not read', () => {
    expect(saleMonthOf('2026-10-05', crossing)).toBe('2026-09-01')
    expect(saleMonthOf(null, crossing)).toBe('2026-09-01')
    expect(saleMonthOf('soon', crossing)).toBe('2026-09-01')
  })
  it('reads a one-day fair and an undated one', () => {
    expect(saleMonthOf('2026-08-28', fair({ endDate: null }))).toBe('2026-08-01')
    expect(saleMonthOf('2026-09-02', fair({ startDate: null, endDate: null, periodMonth: '2026-09-01' }))).toBe('2026-09-01')
  })
  it('is null for a bill no fair claims', () => {
    expect(saleMonthOf('2026-09-18', null)).toBeNull()
  })
})
