import { describe, expect, it } from 'vitest'
import { capacityCards, capacityFromRow, capacityRefusal } from './capacity'

describe('capacityFromRow', () => {
  // member_capacity_of on prod, 2026-10-10: Fair's limit 28, every seat taken; IR never set.
  it('reads the limit, the seats and what is left', () => {
    expect(capacityFromRow({ capacity: 30, occupied: 27, reserved: 1, waiting: 2 })).toEqual({ capacity: 30, occupied: 27, reserved: 1, free: 2, waiting: 2 })
    expect(capacityFromRow({ capacity: 28, occupied: 28, reserved: 0, waiting: 0 })?.free).toBe(0)
  })

  it('has no free figure while no limit is set', () => {
    expect(capacityFromRow({ capacity: null, occupied: 20, reserved: 0, waiting: 0 })).toEqual({ capacity: null, occupied: 20, reserved: 0, free: null, waiting: 0 })
  })

  it('never shows fewer than 0 free when the seats outgrew the limit', () => {
    expect(capacityFromRow({ capacity: 20, occupied: 25, reserved: 0, waiting: 0 })?.free).toBe(0)
  })

  it('takes counts that arrive as strings (bigint from count(*))', () => {
    expect(capacityFromRow({ capacity: 30, occupied: '27', reserved: '1', waiting: '3' })).toEqual({ capacity: 30, occupied: 27, reserved: 1, free: 2, waiting: 3 })
  })

  it('is null when the function had nothing to say (an unknown or closed sub-department)', () => {
    expect(capacityFromRow(null)).toBeNull()
    expect(capacityFromRow(undefined)).toBeNull()
  })
})

describe('capacityRefusal', () => {
  const now = { occupied: 25, reserved: 1 }

  it('takes a whole number at or above the seats taken', () => {
    expect(capacityRefusal('26', now)).toBeNull()
    expect(capacityRefusal(' 30 ', now)).toBeNull()
  })

  it('refuses a limit below active members plus reserved positions', () => {
    expect(capacityRefusal('25', now)).toBe('Capacity cannot be lower than active members plus reserved positions.')
  })

  it('refuses what is not a whole number from 1 to 10,000', () => {
    for (const raw of ['', 'abc', '2.5', '0', '-3', '10001']) {
      expect(capacityRefusal(raw, { occupied: 0, reserved: 0 })).toBe('Give the limit as a whole number from 1 to 10,000.')
    }
  })
})

describe('capacityCards', () => {
  it('says the prototype’s four figures', () => {
    expect(capacityCards({ capacity: 30, occupied: 27, reserved: 0, free: 3, waiting: 2 })).toEqual([
      { label: 'Capacity', value: '30' },
      { label: 'Active', value: '27' },
      { label: 'Reserved', value: '0' },
      { label: 'Free', value: '3' },
    ])
  })

  it('reads “not set” and “—” before a limit exists', () => {
    expect(capacityCards({ capacity: null, occupied: 0, reserved: 0, free: null, waiting: 0 }).map(c => c.value)).toEqual(['not set', '0', '0', '—'])
  })
})
