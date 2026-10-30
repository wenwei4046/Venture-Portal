import { describe, expect, it } from 'vitest'
import {
  NO_MIN_PAY_FROM,
  minPayChoiceWords,
  minPayFromDate,
  minPayFromField,
  minPayFromMissing,
  minPayFromWords,
  minPayLaterMonths,
  minPayStartYM,
  savedMinPayFrom,
} from './min-pay'

// Minimum pay interest's month (2026-10-30, the user's sample A): from the first instalment, or a later month.

describe('the month the check starts', () => {
  it('is the first instalment, unless a later month was set', () => {
    // HC's 220,000 fund in: from 5 Aug 2026, its first instalment Sep 2026.
    expect(minPayStartYM('2026-09', null)).toBe('2026-09')
    expect(minPayStartYM('2026-09', '2026-11-01')).toBe('2026-11')
    // A month set before the first instalment changes nothing.
    expect(minPayStartYM('2026-09', '2026-07-01')).toBe('2026-09')
    expect(minPayStartYM(null, '2026-11-01')).toBe('2026-11')
    expect(minPayStartYM(null, null)).toBeNull()
  })
})

describe('the later months offered', () => {
  it('from the month after the first instalment, two years of them', () => {
    const m = minPayLaterMonths('2026-09', '2026-10')
    expect(m[0]).toBe('2026-10')
    expect(m.at(-1)).toBe('2028-09')
    expect(m).toHaveLength(24)
  })

  it('a year past this month at least, for a deal that started long ago', () => {
    const m = minPayLaterMonths('2025-04', '2026-10')
    expect(m[0]).toBe('2025-05')
    expect(m.at(-1)).toBe('2027-10')
  })
})

describe('the choice', () => {
  const later = minPayLaterMonths('2026-09', '2026-10')

  it('asks for one, then for a later month’s month', () => {
    expect(minPayFromMissing(NO_MIN_PAY_FROM, later)).toBe('from which month minimum pay starts')
    expect(minPayFromMissing({ choice: 'later', month: '' }, later)).toBe('the month minimum pay starts')
    // A month no longer offered (the first repayment moved past it) is asked again.
    expect(minPayFromMissing({ choice: 'later', month: '2026-09' }, later)).toBe('the month minimum pay starts')
    expect(minPayFromMissing({ choice: 'later', month: '2026-11' }, later)).toBeNull()
    expect(minPayFromMissing({ choice: 'first', month: '' }, later)).toBeNull()
  })

  it('goes to the server as `first` or its month, and is stored as null or the month’s first day', () => {
    expect(minPayFromField({ choice: 'first', month: '' })).toBe('first')
    expect(minPayFromField({ choice: 'later', month: '2026-11' })).toBe('2026-11')
    expect(minPayFromDate('2026-11')).toBe('2026-11-01')
    expect(minPayFromDate('first')).toBeNull()
    expect(minPayFromDate('')).toBeNull()
    expect(minPayFromDate(null)).toBeNull()
    expect(minPayFromDate('2026-13')).toBeNull()
  })

  it('a saved deal’s choice, and its words', () => {
    expect(savedMinPayFrom(null)).toEqual({ choice: 'first', month: '' })
    expect(savedMinPayFrom('2026-11-01')).toEqual({ choice: 'later', month: '2026-11' })
    expect(minPayFromWords(null, '2026-09')).toBe('from the first instalment (Sep 2026)')
    expect(minPayFromWords('2026-11-01', '2026-09')).toBe('from Nov 2026')
    expect(minPayChoiceWords({ choice: 'first', month: '' }, '2026-11', later)).toBe('From the first instalment — Nov 2026')
    expect(minPayChoiceWords({ choice: 'later', month: '2026-12' }, '2026-09', later)).toBe('From Dec 2026')
    expect(minPayChoiceWords(NO_MIN_PAY_FROM, '2026-09', later)).toBeNull()
  })
})
