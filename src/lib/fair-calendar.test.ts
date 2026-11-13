import { describe, it, expect } from 'vitest'
import { billOrganiser, saleMonthOf, sortFairs, type Fair } from './fair-calendar'

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

// 2026-11-13: two organisers at one place on the same days are two fairs — 2990s' standing booth at Penang
// Waterfront (MALL MGMT, 29 Oct – 31 Dec) through BIGHOME's fair there (30 Oct – 1 Nov). A bill's page asked the
// place and the day, which answers BIGHOME for a 2990s bill written on 31 October.
describe('billOrganiser', () => {
  const MALL = { erp_organiser_text: 'MALL MGMT', comm_organisers: { name: 'MALL MGMT' } }
  it('is the organiser of the bill’s own fair, whatever the place and the day would answer', () => {
    expect(billOrganiser(MALL, 'BIGHOME')).toBe('MALL MGMT')
    expect(billOrganiser([MALL], 'BIGHOME')).toBe('MALL MGMT')
    expect(billOrganiser({ erp_organiser_text: 'MALL MGMT', comm_organisers: [{ name: 'Mall Management' }] }, null)).toBe('Mall Management')
  })
  it('reads what the ERP wrote when the register names nobody', () => {
    expect(billOrganiser({ erp_organiser_text: ' KAI HAO (KL, CHEN) ', comm_organisers: null }, 'SOLO')).toBe('KAI HAO (KL, CHEN)')
    expect(billOrganiser({ erp_organiser_text: 'SOLO', comm_organisers: { name: '  ' } }, null)).toBe('SOLO')
  })
  it('falls back on the calendar’s answer for a fair that names nobody and a bill no fair claims', () => {
    expect(billOrganiser({ erp_organiser_text: null, comm_organisers: null }, 'HOMELOVE')).toBe('HOMELOVE')
    expect(billOrganiser(null, 'HOMELOVE')).toBe('HOMELOVE')
    expect(billOrganiser([], 'HOMELOVE')).toBe('HOMELOVE')
    expect(billOrganiser(undefined, null)).toBeNull()
    expect(billOrganiser(null, '')).toBeNull()
  })
})
