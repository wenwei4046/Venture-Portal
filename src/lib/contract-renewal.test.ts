import { describe, expect, it } from 'vitest'
import { RENEWAL_LETTER_TYPE, renewalMonths, renewalRefusal, renewalStart } from './contract-renewal'

// Renew a contract (2026-10-24 — the user: "当它已经 expired 之后，到时候按一下 renew，就可以再选一次是几个月，对不对？同时要
// attach 一个新的 contract"): the new contract starts the day after the old one ends unless HR picks another day, its
// period from the contract periods again, and it must end after the one it replaces.

const NOW = { startsOn: '2026-10-01', months: 12, endsOn: '2027-09-30' }

describe('where a renewal starts', () => {
  it('the day after the contract’s end — or nowhere without one', () => {
    expect(renewalStart('2027-09-30')).toBe('2027-10-01')
    expect(renewalStart('2026-12-31')).toBe('2027-01-01')
    expect(renewalStart(null)).toBeNull()
    expect(renewalStart('30/09/2027')).toBeNull()
  })

  it('on their own period when it is one of the six, else 12 months', () => {
    expect(renewalMonths(24)).toBe(24)
    expect(renewalMonths(7)).toBe(12)
    expect(renewalMonths(null)).toBe(12)
  })

  it('files its new contract under the one type whose name says contract', () => {
    expect(RENEWAL_LETTER_TYPE.test('Contract for Service')).toBe(true)
    expect(RENEWAL_LETTER_TYPE.test('Offer letter')).toBe(false)
  })
})

describe('renewalRefusal', () => {
  it('lets a renewal from the day after the end go, and one that starts late (a gap) or early (overlapping)', () => {
    expect(renewalRefusal(NOW, '2027-10-01', 12)).toBeNull()
    expect(renewalRefusal(NOW, '2027-11-15', 6)).toBeNull()
    expect(renewalRefusal(NOW, '2027-06-01', 12)).toBeNull()
  })

  it('asks for a period from the list and a real first day', () => {
    expect(renewalRefusal(NOW, '2027-10-01', 7)).toBe("Pick the new contract's period.")
    expect(renewalRefusal(NOW, '2027-02-30', 12)).toBe('Pick the day the new contract starts.')
    expect(renewalRefusal(NOW, '', 12)).toBe('Pick the day the new contract starts.')
  })

  it('refuses a contract with no end to renew from', () => {
    expect(renewalRefusal({ startsOn: null, months: 12, endsOn: null }, '2027-10-01', 12)).toBe('Their contract has no end yet — fill in the hire date first.')
  })

  it('starts after the contract it replaces did, and ends after it does', () => {
    expect(renewalRefusal(NOW, '2026-10-01', 36)).toBe('The new contract starts after this one did (1 Oct 2026).')
    expect(renewalRefusal(NOW, '2026-09-01', 36)).toBe('The new contract starts after this one did (1 Oct 2026).')
    // From 1 Mar 2027 for 6 months ends 31 Aug 2027 — before this one's 30 Sep.
    expect(renewalRefusal(NOW, '2027-03-01', 6)).toBe('The new contract has to end after this one does (30 Sep 2027).')
  })
})
