import { describe, expect, it } from 'vitest'
import { AUTOMATIC_MONTH, claimApprovedDone, claimMonthChoices, claimOwnMonth, monthLabel } from './claim-payroll-month'

describe('claimOwnMonth — the twin of member_claim_own_month', () => {
  it('a food claim: the month claimed', () => {
    expect(claimOwnMonth({ claimType: 'food', month: '2026-10' }, '2026-11-09')).toBe('2026-10')
  })
  it('a fair claim: its brand week (a fair of 30 Oct – 1 Nov is October)', () => {
    expect(claimOwnMonth({ claimType: 'outstation', week: '2026-10-30' }, '2026-11-09')).toBe('2026-10')
  })
  // Regression 2026-11-10: RQ-2611-020, an Other claim for 30 Oct – 1 Nov, names no month.
  it('an Other claim: the month it was sent', () => {
    expect(claimOwnMonth({ claimType: 'other' }, '2026-11-10')).toBe('2026-11')
  })
})

describe('claimMonthChoices', () => {
  it('opens on Automatic, naming the month it would use, then three months back to next month', () => {
    expect(claimMonthChoices('2026-11', '2026-11')).toEqual([
      { value: AUTOMATIC_MONTH, label: 'Automatic · Nov 2026' },
      { value: '2026-08', label: 'Aug 2026' },
      { value: '2026-09', label: 'Sep 2026' },
      { value: '2026-10', label: 'Oct 2026' },
      { value: '2026-11', label: 'Nov 2026' },
      { value: '2026-12', label: 'Dec 2026' },
    ])
  })
  it('crosses a year', () => {
    expect(claimMonthChoices('2027-01', '2027-01').map(c => c.value)).toEqual(['', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02'])
  })
})

describe('labels', () => {
  it('writes a month in three letters, never "Sept"', () => {
    expect(monthLabel('2026-09')).toBe('Sep 2026')
  })
  it('names the picked month in the toast', () => {
    expect(claimApprovedDone('2026-10')).toBe('Claim approved — added to the Oct 2026 payroll')
    expect(claimApprovedDone(AUTOMATIC_MONTH)).toBe('Claim approved — added to payroll')
  })
})
