import { describe, it, expect } from 'vitest'
import { salesByVenue, venueKey, venueName } from './venues'

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

describe('salesByVenue', () => {
  const register = new Map([
    ['SPICE ARENA', { displayName: 'SPICE ARENA', organizer: 'Homedec' }],
    ['BUKIT JALIL STADIUM', { displayName: 'BUKIT JALIL STADIUM', organizer: null }],
  ])

  it('groups by the matching key, biggest first, with the organiser attached', () => {
    const rows = salesByVenue(
      [
        { venue: 'SPICE ARENA', staffKey: 'a', amount: 1_000 },
        { venue: 'spice   arena', staffKey: 'b', amount: 2_000 },
        { venue: 'BUKIT JALIL STADIUM', staffKey: 'a', amount: 500 },
      ],
      register,
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      venueKey: 'SPICE ARENA',
      organizer: 'Homedec',
      orders: 2,
      people: 2,
      total: 3_000,
    })
    expect(rows[1]).toMatchObject({ venueKey: 'BUKIT JALIL STADIUM', organizer: null, people: 1 })
  })

  it('shows the orders the ERP sent without a venue rather than dropping them', () => {
    const rows = salesByVenue([{ venue: null, staffKey: 'a', amount: 900 }], register)
    expect(rows).toEqual([
      { venueKey: '', displayName: '(no venue)', organizer: null, orders: 1, people: 1, total: 900 },
    ])
  })

  it('counts a person once per venue however many bills they wrote', () => {
    const rows = salesByVenue(
      [
        { venue: 'SPICE ARENA', staffKey: 'a', amount: 100 },
        { venue: 'SPICE ARENA', staffKey: 'a', amount: 100 },
      ],
      register,
    )
    expect(rows[0].people).toBe(1)
    expect(rows[0].orders).toBe(2)
  })

  it('falls back to the register’s spelling for a venue the month never named', () => {
    const rows = salesByVenue([{ venue: '  ', staffKey: null, amount: 0 }], new Map())
    expect(rows[0].displayName).toBe('(no venue)')
  })
})
