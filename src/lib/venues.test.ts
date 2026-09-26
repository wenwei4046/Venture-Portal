import { describe, it, expect } from 'vitest'
import { salesByFair, venueKey, venueName } from './venues'

describe('venueKey', () => {
  it('matches SQL venue_key(): upper case, single spaces', () => {
    expect(venueKey('  spice   arena ')).toBe('SPICE ARENA')
    expect(venueKey('SPICE ARENA')).toBe('SPICE ARENA')
  })

  it('is nothing for nothing', () => {
    expect(venueKey(null)).toBeNull()
    expect(venueKey(undefined)).toBeNull()
    expect(venueKey('   ')).toBeNull()
  })
})

describe('venueName', () => {
  it('keeps the ERP’s spelling but tidies the spaces', () => {
    expect(venueName(' Midvalley  Southkey JB ')).toBe('Midvalley Southkey JB')
    expect(venueName('')).toBeNull()
  })
})

describe('salesByFair', () => {
  const mvec = { id: 'f-rex', venueKey: 'MVEC SOUTHKEY', venueName: 'MVEC SOUTHKEY' }
  const mvecLater = { id: 'f-bighome', venueKey: 'MVEC SOUTHKEY', venueName: 'MVEC SOUTHKEY' }

  it('is one row per fair, with the days and organiser the calendar gives it, biggest first', () => {
    const rows = salesByFair([
      { venue: 'MVEC SOUTHKEY', fair: mvec, event: '14–16 Aug', organizer: 'REX', staffKey: 'a', amount: 1_000, commissionable: 900 },
      { venue: 'mvec  southkey', fair: mvec, event: '14–16 Aug', organizer: 'REX', staffKey: 'b', amount: 2_000, commissionable: 2_000 },
      { venue: 'SPICE ARENA', fair: { id: 'f-spice', venueKey: 'SPICE ARENA', venueName: 'SPICE ARENA' }, event: '1–3 Aug', organizer: null, staffKey: 'a', amount: 500 },
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      key: 'fair:f-rex', venueKey: 'MVEC SOUTHKEY', displayName: 'MVEC SOUTHKEY', fairId: 'f-rex',
      event: '14–16 Aug', organizer: 'REX', orders: 2, people: 2, total: 3_000, commissionable: 2_900,
    })
    expect(rows[1]).toMatchObject({ key: 'fair:f-spice', event: '1–3 Aug', organizer: null, people: 1 })
  })

  // One hall, two fairs, two organisers (REX mid-August, BIGHOME at month end).
  it('keeps two fairs at one hall apart, each with its own organiser', () => {
    const rows = salesByFair([
      { venue: 'MVEC SOUTHKEY', fair: mvec, event: '14–16 Aug', organizer: 'REX', staffKey: 'a', amount: 1_000 },
      { venue: 'MVEC SOUTHKEY', fair: mvecLater, event: '28–31 Aug', organizer: 'BIGHOME', staffKey: 'a', amount: 1_000 },
    ])
    expect(rows.map(r => [r.venueKey, r.event, r.organizer])).toEqual([
      ['MVEC SOUTHKEY', '14–16 Aug', 'REX'],
      ['MVEC SOUTHKEY', '28–31 Aug', 'BIGHOME'],
    ])
  })

  it('groups the bills no fair claims by their place, every spelling of it in one row', () => {
    const rows = salesByFair([
      { venue: 'PISA SPICE ARENA', groupKey: 'PISA SPICE ARENA', groupName: 'PISA SPICE ARENA', staffKey: 'a', amount: 1_000 },
      { venue: 'PISA SPICE ARENA CONVENTION CENTRE', groupKey: 'PISA SPICE ARENA', groupName: 'PISA SPICE ARENA', staffKey: 'b', amount: 500 },
      { venue: 'PISA SPICE ARENA', groupKey: 'PISA SPICE ARENA', fair: { id: 'f1', venueKey: 'PISA SPICE ARENA', venueName: 'PISA SPICE ARENA' }, event: '5–7 Sep', staffKey: 'a', amount: 100 },
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      key: 'place:PISA SPICE ARENA', venueKey: 'PISA SPICE ARENA', fairId: null, event: null,
      orders: 2, people: 2, total: 1_500,
    })
    expect(rows[1]).toMatchObject({ key: 'fair:f1', event: '5–7 Sep', total: 100 })
  })

  it('names a fair by its own place, even for a bill pinned there without a venue', () => {
    const rows = salesByFair([
      { venue: null, fair: mvec, event: '14–16 Aug', organizer: 'REX', staffKey: 'a', amount: 700 },
    ])
    expect(rows[0]).toMatchObject({ venueKey: 'MVEC SOUTHKEY', displayName: 'MVEC SOUTHKEY', event: '14–16 Aug' })
  })

  it('keeps two places apart when nobody has said they are the same', () => {
    const rows = salesByFair([
      { venue: 'SPICE ARENA', groupKey: 'SPICE ARENA', staffKey: 'a', amount: 100 },
      { venue: 'SETIA SPICE CONVENTION CENTRE', groupKey: 'SETIA SPICE CONVENTION CENTRE', staffKey: 'a', amount: 100 },
    ])
    expect(rows).toHaveLength(2)
  })

  it('shows the orders the ERP sent without a venue rather than dropping them', () => {
    const rows = salesByFair([
      { venue: null, staffKey: 'a', amount: 900 },
      { venue: '  ', staffKey: null, amount: 100 },
    ])
    expect(rows).toEqual([{
      key: 'place:', venueKey: '', displayName: '(no venue)', fairId: null, event: null, organizer: null,
      orders: 2, people: 1, total: 1_000, commissionable: 0,
    }])
  })

  it('counts a person once per fair however many bills they wrote', () => {
    const rows = salesByFair([
      { venue: 'SPICE ARENA', staffKey: 'a', amount: 100 },
      { venue: 'SPICE ARENA', staffKey: 'a', amount: 100 },
    ])
    expect(rows[0].people).toBe(1)
    expect(rows[0].orders).toBe(2)
  })
})
