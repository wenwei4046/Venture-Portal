import { describe, expect, it } from 'vitest'
import { staffCodeNumber } from './staff-codes'

/**
 * The app-side twin of the database's `staff_code_number()` (migration
 * 20260915040000): the same codes must read the same number on both sides,
 * or the roster's order would disagree with the sequence.
 */
describe('staffCodeNumber', () => {
  it('reads the number inside an HV code, whatever the padding', () => {
    expect(staffCodeNumber('HV007')).toBe(7)
    expect(staffCodeNumber('HV062')).toBe(62)
    expect(staffCodeNumber('HV1000')).toBe(1000)
  })

  it('tolerates the case and whitespace the database tolerates', () => {
    expect(staffCodeNumber(' hv 12 ')).toBe(12)
    expect(staffCodeNumber('Hv003')).toBe(3)
  })

  it('reads nothing into a code that is not an HV number', () => {
    expect(staffCodeNumber('HVI001')).toBeNull()
    expect(staffCodeNumber('TEST-SEP26-B01')).toBeNull()
    expect(staffCodeNumber('HV')).toBeNull()
    expect(staffCodeNumber('HV1234567890')).toBeNull()
    expect(staffCodeNumber('')).toBeNull()
    expect(staffCodeNumber(null)).toBeNull()
    expect(staffCodeNumber(undefined)).toBeNull()
  })
})
