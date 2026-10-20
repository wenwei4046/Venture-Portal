import { describe, expect, it } from 'vitest'
import { HOLIDAY_STATES, holidayStateOf } from './holiday-states'

// A location's address names its state as the postcode list does; its public holidays are named as Settings ›
// Holidays names them (2026-10-20).

describe('holidayStateOf', () => {
  it('names the holidays’ state for each state the postcode list has', () => {
    expect(holidayStateOf('Pulau Pinang')).toBe('Penang')
    expect(holidayStateOf('W.P. Kuala Lumpur')).toBe('Federal Territory')
    expect(holidayStateOf('W.P. Labuan')).toBe('Federal Territory')
    expect(holidayStateOf('W.P. Putrajaya')).toBe('Federal Territory')
    for (const same of ['Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu'])
      expect(holidayStateOf(same)).toBe(same)
  })

  it('names none for a place abroad or no state at all', () => {
    expect(holidayStateOf('Johor Bahru')).toBeNull()
    expect(holidayStateOf('')).toBeNull()
    expect(holidayStateOf('  Selangor ')).toBe('Selangor')
  })

  it('every name it gives is one Settings › Holidays offers', () => {
    const offered = new Set<string>(HOLIDAY_STATES)
    for (const s of ['Pulau Pinang', 'W.P. Labuan', 'Selangor']) expect(offered.has(holidayStateOf(s)!)).toBe(true)
  })
})
