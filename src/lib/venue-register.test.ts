import { describe, it, expect } from 'vitest'
import {
  groupByVenue,
  organiserTotals,
  registerMonths,
  registerSummary,
  type VenueRegisterRow,
} from './venue-register'

function row(partial: Partial<VenueRegisterRow> & { venueKey: string }): VenueRegisterRow {
  return {
    displayName: partial.venueKey,
    aliases: [],
    periodMonth: '2026-08-01',
    subDepartmentId: 'sub-1',
    organiserId: null,
    organiserName: null,
    erpOrganiserText: null,
    source: null,
    people: 1,
    bills: 1,
    total: 100,
    ...partial,
  }
}

const rows: VenueRegisterRow[] = [
  row({
    venueKey: 'SPICE ARENA',
    periodMonth: '2026-08-01',
    organiserId: 'o1',
    organiserName: 'HOMEDEC',
    source: 'manual',
    bills: 61,
    people: 13,
    total: 437_243,
  }),
  row({
    venueKey: 'SPICE ARENA',
    periodMonth: '2026-09-01',
    organiserId: 'o1',
    organiserName: 'HOMEDEC',
    source: 'manual',
    bills: 3,
    people: 2,
    total: 12_000,
  }),
  row({ venueKey: 'MIDVALLEY SOUTHKEY JB', periodMonth: '2026-08-01', bills: 45, people: 9, total: 332_203 }),
  row({ venueKey: 'THE STARLING', periodMonth: null, bills: 0, people: 0, total: 0 }),
]

describe('registerMonths', () => {
  it('lists every month with bills, newest first', () => {
    expect(registerMonths(rows)).toEqual(['2026-09-01', '2026-08-01'])
  })

  it('ignores the venues that have no bills at all', () => {
    expect(registerMonths([row({ venueKey: 'X', periodMonth: null })])).toEqual([])
  })
})

describe('groupByVenue', () => {
  it('groups the fairs under their place, biggest first, months newest first', () => {
    const venues = groupByVenue(rows)
    expect(venues.map(v => v.venueKey)).toEqual([
      'SPICE ARENA',
      'MIDVALLEY SOUTHKEY JB',
      'THE STARLING',
    ])
    expect(venues[0]).toMatchObject({ bills: 64, total: 449_243, named: 2 })
    expect(venues[0].months.map(m => m.periodMonth)).toEqual(['2026-09-01', '2026-08-01'])
  })

  it('keeps a venue with no bills, with no months under it', () => {
    const starling = groupByVenue(rows).find(v => v.venueKey === 'THE STARLING')
    expect(starling).toMatchObject({ months: [], bills: 0, total: 0, named: 0 })
  })

  it('narrows to one month — one row per venue, the shape for naming a month', () => {
    const venues = groupByVenue(rows, '2026-09-01')
    expect(venues.map(v => v.venueKey)).toEqual(['SPICE ARENA'])
    expect(venues[0].months).toHaveLength(1)
    expect(venues[0].bills).toBe(3)
  })

  it('drops a venue that had no fair that month rather than showing an empty row', () => {
    expect(groupByVenue(rows, '2026-09-01').some(v => v.venueKey === 'THE STARLING')).toBe(false)
  })

  it('carries the spellings folded into the place', () => {
    const venues = groupByVenue([
      row({ venueKey: 'MIDVALLEY EXHIBITION CENTRE', aliases: ['MID VALLEY', 'MVEC'] }),
    ])
    expect(venues[0].aliases).toEqual(['MID VALLEY', 'MVEC'])
  })
})

describe('registerSummary', () => {
  it('counts places, the fairs that happened and the ones named', () => {
    expect(registerSummary(rows)).toEqual({ venues: 3, fairs: 3, named: 2, unmatched: 0 })
  })

  it('counts a month of one venue when narrowed', () => {
    expect(registerSummary(rows, '2026-08-01')).toEqual({
      venues: 2,
      fairs: 2,
      named: 1,
      unmatched: 0,
    })
  })

  it('counts a fair the ERP named somebody the register has never heard of', () => {
    // The feed does not carry an organiser yet. When it does, this is the
    // number that says "go and look".
    const summary = registerSummary([
      row({ venueKey: 'IOI PUTRAJAYA', erpOrganiserText: 'STAR PROPERTY FAIR', source: 'erp' }),
    ])
    expect(summary).toMatchObject({ fairs: 1, named: 0, unmatched: 1 })
  })

  it('does not count a matched ERP organiser as unmatched', () => {
    const summary = registerSummary([
      row({
        venueKey: 'IOI PUTRAJAYA',
        organiserId: 'o2',
        organiserName: 'Star Property Fair',
        erpOrganiserText: 'STAR PROPERTY FAIR',
        source: 'erp',
      }),
    ])
    expect(summary).toMatchObject({ named: 1, unmatched: 0 })
  })
})

describe('organiserTotals', () => {
  it('adds up the fairs each organiser ran, and what was sold at them', () => {
    expect(organiserTotals(rows).get('o1')).toEqual({ fairs: 2, bills: 64, total: 449_243 })
  })

  it('leaves out an unnamed fair, and a venue with no bills', () => {
    const totals = organiserTotals(rows)
    expect(totals.size).toBe(1)
  })
})
