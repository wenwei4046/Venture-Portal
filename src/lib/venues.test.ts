import { describe, it, expect } from 'vitest'
import { venueKey, venueName } from './venues'

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
