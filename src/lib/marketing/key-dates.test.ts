import { describe, expect, it } from 'vitest'
import {
  blankKey, keyDateDays, keyDateRows, keyDatesFromRow, keyDraftOf, keyFlags, keyPatch, keyPatchOf, keyProblems, nextKeyDay, type MktKeyDate,
} from './key-dates'

// 2026-10-25 — a subsidiary's own key dates (mig 20261025235500; the user's answer 14 and "Marketing 全员，可每年重复"):
// once or every year, flagged beside HR's holidays, listed and changed on its page — only what changed is sent.

const K = (id: string, day: string, name: string, more: Partial<MktKeyDate> = {}): MktKeyDate => ({ id, day, name, short: null, yearly: false, ...more })
const SALE = K('k1', '2026-11-11', '11.11 sale day', { short: '11.11', yearly: true })
const SHOWROOM = K('k2', '2026-11-21', 'New Carres showroom opens (Puchong)', { short: 'Showroom' })
const LEAP = K('k3', '2028-02-29', 'Leap promo', { yearly: true })

describe('a key date', () => {
  it('is read with its day and name — anything else left out; the PIC’s carry no id', () => {
    expect(keyDatesFromRow([
      { id: 'k1', day: '2026-11-11', name: ' 11.11 sale day ', short: '11.11', yearly: true },
      { day: '2026-12-31', name: 'Payday', short: '  ' },
      { id: 'x', day: '2026-02-30', name: 'Not a day' },
      { id: 'y', day: '2026-12-01', name: '   ' },
      'junk', null,
    ])).toEqual([
      { id: 'k1', day: '2026-11-11', name: '11.11 sale day', short: '11.11', yearly: true },
      { id: '', day: '2026-12-31', name: 'Payday', short: null, yearly: false },
    ])
    expect(keyDatesFromRow(null)).toEqual([])
  })

  it('falls on its own day — and, every year, on the same day each year after it, never before', () => {
    expect(keyDateDays(SHOWROOM, '2026-10-01', '2027-12-31')).toEqual(['2026-11-21'])
    expect(keyDateDays(SHOWROOM, '2026-12-01', '2027-12-31')).toEqual([])
    expect(keyDateDays(SALE, '2025-01-01', '2028-06-30')).toEqual(['2026-11-11', '2027-11-11'])
    expect(keyDateDays(SALE, '2026-11-12', '2027-11-10')).toEqual([])
    // A 29 Feb falls on 28 Feb in a year without one.
    expect(keyDateDays(LEAP, '2028-01-01', '2032-12-31')).toEqual(['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29'])
  })

  it('is flagged beside HR’s holidays — its own first, by its flag’s words or its name; a holiday it keeps itself shows once', () => {
    const holidays = [{ day: '2026-11-08', name: 'Deepavali' }, { day: '2026-11-11', name: '11.11 Sale Day' }, { day: '2026-12-25', name: 'Christmas Day' }]
    const own = [SALE, SHOWROOM, K('k4', '2026-11-08', 'Payday')]
    expect(keyFlags(own, holidays, '2026-11-01', '2026-12-31')).toEqual([
      { day: '2026-11-08', name: 'Payday', short: 'Payday', id: 'k4', own: true },
      { day: '2026-11-08', name: 'Deepavali', short: 'Deepavali', id: null, own: false },
      { day: '2026-11-11', name: '11.11 sale day', short: '11.11', id: 'k1', own: true },
      { day: '2026-11-21', name: 'New Carres showroom opens (Puchong)', short: 'Showroom', id: 'k2', own: true },
      { day: '2026-12-25', name: 'Christmas Day', short: 'Christmas', id: null, own: false },
    ])
    // The PIC's carry no id: flagged all the same — its own still first — opening nothing.
    expect(keyFlags([{ ...SALE, id: '', day: '2026-11-08', yearly: false }], holidays, '2026-11-01', '2026-11-08')).toEqual([
      { day: '2026-11-08', name: '11.11 sale day', short: '11.11', id: null, own: true },
      { day: '2026-11-08', name: 'Deepavali', short: 'Deepavali', id: null, own: false },
    ])
  })

  it('lists by the next day each falls on — every year’s this year’s or next; a one-off passed goes last, the latest first', () => {
    const today = '2026-11-15'
    expect(nextKeyDay(SALE, today)).toBe('2027-11-11')
    expect(nextKeyDay(SALE, '2026-11-11')).toBe('2026-11-11')
    expect(nextKeyDay(SHOWROOM, today)).toBe('2026-11-21')
    expect(nextKeyDay(SHOWROOM, '2026-11-22')).toBeNull()
    expect(nextKeyDay(LEAP, '2029-03-01')).toBe('2030-02-28')
    const past = K('k5', '2026-10-01', 'Old launch')
    const older = K('k6', '2026-09-01', 'Older launch')
    expect(keyDateRows([past, SALE, older, SHOWROOM, LEAP], today).map(r => [r.key.id, r.when, r.repeat])).toEqual([
      ['k2', 'Sat 21 Nov 2026', null],
      ['k1', 'Thu 11 Nov 2027', 'Every year'],
      ['k3', 'Tue 29 Feb 2028', 'Every year from 2028'],
      ['k5', 'Thu 1 Oct 2026', null],
      ['k6', 'Tue 1 Sep 2026', null],
    ])
  })

  it('needs a day and a name; its name and its flag have their limits', () => {
    expect(keyProblems(blankKey('2026-10-25'))).toEqual(['Name the key date.'])
    expect(keyProblems({ day: '', name: 'Payday', short: '', yearly: false })).toEqual(['Pick the key date’s day.'])
    expect(keyProblems({ day: '2026-02-30', name: 'Payday', short: '', yearly: false })).toEqual(['Pick the key date’s day.'])
    expect(keyProblems({ day: '2101-01-01', name: 'x'.repeat(81), short: 'y'.repeat(17), yearly: false })).toEqual([
      'Pick the key date’s day.', 'A key date’s name is 80 characters at most.', 'The words on its flag are 16 characters at most.'])
    expect(keyProblems({ day: '2026-12-31', name: ' Payday ', short: '', yearly: true })).toEqual([])
  })

  it('sends a new one in full, else only what changed — nothing when nothing did', () => {
    expect(keyPatch(null, { day: '2026-12-31', name: ' Payday ', short: ' ', yearly: false })).toEqual({ day: '2026-12-31', name: 'Payday', short: '', yearly: false })
    const was = keyDraftOf(SHOWROOM)
    expect(keyPatch(was, { ...was })).toBeNull()
    expect(keyPatch(was, { ...was, name: `${was.name} ` })).toBeNull()
    expect(keyPatch(was, { ...was, day: '2026-11-28', yearly: true })).toEqual({ day: '2026-11-28', yearly: true })
    expect(keyPatch(was, { ...was, short: '' })).toEqual({ short: '' })
    // The server takes the four, each of its own kind — nothing else.
    expect(keyPatchOf({ day: '2026-11-28', name: 'x', short: 'y', yearly: true, sub: 'z', id: 1 })).toEqual({ day: '2026-11-28', name: 'x', short: 'y', yearly: true })
    expect(keyPatchOf({ yearly: 'yes', day: 20261128 })).toBeNull()
    expect(keyPatchOf(null)).toBeNull()
  })
})
