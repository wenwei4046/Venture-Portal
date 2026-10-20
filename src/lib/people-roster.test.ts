import { describe, expect, it } from 'vitest'
import { NO_DEPT, initialsOf, rosterCounts, rosterDepartments, rosterGroups, rosterMatches, type RosterPerson } from './people-roster'

// People Management's roster (2026-10-10, the HR revamp): the five cards, the
// search and the employment filter, the department bands.

const person = (over: Partial<RosterPerson> & { name: string }): RosterPerson => ({
  code: null, title: null, department: 'Revenue', accountEmail: null, active: true, missing: [], ...over,
})
const roster = [
  person({ name: 'ANTHONY', code: 'HV008', title: 'Team Leader', accountEmail: 'anthony@houzs.my' }),
  person({ name: 'ZACK', code: 'HV030', title: 'Revenue Specialist', missing: ['NRIC'] }),
  person({ name: 'LOO WEN WEI', code: 'HV001', title: 'CHIEF EXECUTIVE OFFICER', department: 'Director', missing: ['NRIC', 'bank account'] }),
  person({ name: 'miao miao', title: 'Revenue Specialist', active: false }),
  person({ name: 'NOBODY', department: null }),
]

describe('the roster', () => {
  it('counts the five cards over everybody, whatever the filter shows', () => {
    expect(rosterCounts(roster)).toEqual({ total: 5, active: 4, inactive: 1, withLogin: 1, invited: 0, incomplete: 2, departments: 3 })
  })

  // 2026-10-16: an invite link not used yet is a login nobody can sign in with — counted apart.
  it('does not count an invite link not used yet as a way in', () => {
    const invited = [...roster, person({ name: 'KAI YEE', accountEmail: 'kaiyee@houzs.my', invitePending: true })]
    expect(rosterCounts(invited)).toMatchObject({ withLogin: 1, invited: 1 })
  })

  it('searches name, code, title, department and email, inside the employment filter', () => {
    const shown = (q: string, status: 'active' | 'inactive' | 'all') => roster.filter(p => rosterMatches(p, q, status)).map(p => p.name)
    expect(shown('', 'active')).toEqual(['ANTHONY', 'ZACK', 'LOO WEN WEI', 'NOBODY'])
    expect(shown('', 'inactive')).toEqual(['miao miao'])
    expect(shown('hv00', 'all')).toEqual(['ANTHONY', 'LOO WEN WEI'])
    expect(shown('specialist', 'all')).toEqual(['ZACK', 'miao miao'])
    expect(shown('ANTHONY@', 'active')).toEqual(['ANTHONY'])
    expect(shown('director', 'active')).toEqual(['LOO WEN WEI'])
  })

  it('bands by department A→Z, nobody’s last, each in the given order with its incomplete count', () => {
    const groups = rosterGroups(roster, (a, b) => a.name.localeCompare(b.name))
    expect(groups.map(g => [g.dept, g.rows.map(r => r.name), g.incomplete])).toEqual([
      ['Director', ['LOO WEN WEI'], 1],
      ['Revenue', ['ANTHONY', 'miao miao', 'ZACK'], 1],
      [NO_DEPT, ['NOBODY'], 0],
    ])
  })

  it('makes a tile from the first two words', () => {
    expect(initialsOf('LOO WEN WEI')).toBe('LW')
    expect(initialsOf('miao miao')).toBe('MM')
    expect(initialsOf(' ZACK ')).toBe('Z')
    expect(initialsOf('')).toBe('')
  })
})

// 2026-10-20 — the user: "People Management 这边要多加一个 filter：这个 filter 是 drop down 来的，可以选 department"; and the
// roster lists the full name (last, then first), the IC's name still found by the search.
describe('the department filter and the full name', () => {
  const people = [
    person({ name: 'Teoh CHEA HUAN', icName: 'CHEA HUAN', department: 'Revenue Department' }),
    person({ name: 'KRIS', icName: 'KRIS', department: 'Revenue Department' }),
    person({ name: 'LOO WEN WEI', icName: 'LOO WEN WEI', department: 'Director' }),
    person({ name: 'GONE', department: 'Director', active: false }),
    person({ name: 'NOBODY', department: null }),
  ]
  const shown = (q: string, dept: string, status: 'active' | 'inactive' | 'all' = 'active') =>
    people.filter(p => rosterMatches(p, q, status, dept)).map(p => p.name)

  it('shows one department, every one when none is picked, and the people in none by their own choice', () => {
    expect(shown('', 'Revenue Department')).toEqual(['Teoh CHEA HUAN', 'KRIS'])
    expect(shown('', 'Director', 'all')).toEqual(['LOO WEN WEI', 'GONE'])
    expect(shown('', NO_DEPT)).toEqual(['NOBODY'])
    expect(shown('', '')).toEqual(['Teoh CHEA HUAN', 'KRIS', 'LOO WEN WEI', 'NOBODY'])
  })

  it('searches inside the department, by the name listed or the one on their IC', () => {
    expect(shown('teoh', 'Revenue Department')).toEqual(['Teoh CHEA HUAN'])
    expect(shown('chea  huan', '')).toEqual(['Teoh CHEA HUAN'])
    expect(shown('teoh', 'Director')).toEqual([])
  })

  it('offers every department A→Z with its count, none last', () => {
    expect(rosterDepartments(people)).toEqual([
      { dept: 'Director', count: 2 },
      { dept: 'Revenue Department', count: 2 },
      { dept: NO_DEPT, count: 1 },
    ])
    expect(rosterDepartments(people.filter(p => p.active))).toEqual([
      { dept: 'Director', count: 1 },
      { dept: 'Revenue Department', count: 2 },
      { dept: NO_DEPT, count: 1 },
    ])
  })
})
