import { describe, expect, it } from 'vitest'
import {
  DerivedCommissionError,
  resolveCommissionWrite,
} from './derived-commission'

/** The shape the payroll grid actually posts: every field optional. */
type Fields = { deduction_amount?: number; commission_amount?: number }

const DERIVED = { isDerived: true, stored: 4321.5, name: 'LIM AH KOW' }
const NORMAL = { isDerived: false, stored: 0, name: 'SITI' }

describe('resolveCommissionWrite', () => {
  it('leaves an ordinary employee alone — HR types their commission', () => {
    const fields: Fields = { deduction_amount: 50, commission_amount: 900 }
    expect(resolveCommissionWrite(fields, NORMAL)).toEqual(fields)
  })

  it('leaves a payload with no commission in it alone', () => {
    const fields: Fields = { deduction_amount: 50 }
    expect(resolveCommissionWrite(fields, DERIVED)).toEqual(fields)
  })

  it('drops an unchanged commission that rode along with a real edit', () => {
    // The grid posts the whole row when any cell changes. This is the ordinary
    // case, and it must not fail.
    const out = resolveCommissionWrite<Fields>(
      { deduction_amount: 50, commission_amount: 4321.5 },
      DERIVED,
    )
    expect(out).toEqual({ deduction_amount: 50 })
    expect('commission_amount' in out).toBe(false)
  })

  it('treats a sub-cent difference as unchanged, not as an edit', () => {
    const out = resolveCommissionWrite<Fields>({ commission_amount: 4321.503 }, DERIVED)
    expect(out).toEqual({})
  })

  it('refuses to MOVE a derived commission, and says who and what to do', () => {
    expect(() =>
      resolveCommissionWrite({ commission_amount: 9999 }, DERIVED),
    ).toThrow(DerivedCommissionError)

    try {
      resolveCommissionWrite({ commission_amount: 9999 }, DERIVED)
    } catch (err) {
      const msg = (err as Error).message
      expect(msg).toContain('LIM AH KOW')
      expect(msg).toContain('commission run')
    }
  })

  it('refuses a zeroing edit too — that is the one that would look harmless', () => {
    expect(() => resolveCommissionWrite({ commission_amount: 0 }, DERIVED)).toThrow(
      DerivedCommissionError,
    )
  })

  it('passes a row it knows nothing about through untouched', () => {
    const fields: Fields = { commission_amount: 100 }
    expect(resolveCommissionWrite(fields, undefined)).toEqual(fields)
  })
})
