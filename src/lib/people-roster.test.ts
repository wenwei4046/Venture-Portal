import { describe, expect, it } from 'vitest'
import { compareByLadder } from './ladder'
import {
  NO_DEPT,
  initialsOf,
  nextSort,
  rankSeniority,
  rosterCompare,
  rosterCounts,
  rosterDepartments,
  rosterGroups,
  rosterMatches,
  type RosterPerson,
  type RosterSort,
  type SortablePerson,
} from './people-roster'

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

// 2026-10-22 — the user, circling the roster's heads: "like press name, will be follow by alpahabe 排法， title will be
// follow title 高到低 按多一次就低到高". Each band is sorted by the column pressed; a tie reads in the ladder's order.
describe('a column head sorts each band', () => {
  const sp = (over: Partial<SortablePerson> & { name: string }): SortablePerson => ({
    code: null, title: null, department: 'Revenue', accountEmail: null, active: true, missing: [], levelRank: null, lastSeenAt: null, ...over,
  })
  const band = [
    sp({ name: 'ANTHONY', code: 'HV008', title: 'Team Leader', levelRank: 7, rankLabel: 'Rank B', rankRate: 0.09, lastSeenAt: '2026-10-20T03:00:00Z', employmentStatus: 'permanent', hireDate: '2024-03-01' }),
    sp({ name: 'zack', code: 'HV030', title: 'Revenue Specialist', levelRank: 3, rankLabel: 'Rank F', rankRate: 0.05, missing: ['NRIC'], employmentStatus: 'probation', hireDate: '2026-10-05' }),
    sp({ name: 'CHEA HUAN', code: 'HV009', title: 'Team Leader', levelRank: 7, rankLabel: 'Rank SS', rankRate: 0, lastSeenAt: '2026-10-21T03:00:00Z', employmentStatus: 'permanent', hireDate: '2026-10-01' }),
    sp({ name: 'Bella', code: 'HV012', title: 'Revenue Specialist', levelRank: 3, rankLabel: 'Rank A', rankRate: 0.04, missing: ['NRIC', 'bank account'], employmentStatus: 'part_time', hireDate: '2026-09-01' }),
    sp({ name: 'INTERN', title: 'Intern', levelRank: null, employmentStatus: null }),
    sp({ name: 'GONE', code: 'HV004', title: 'Revenue Specialist', levelRank: 3, active: false, lastSeenAt: '2026-01-02T03:00:00Z', employmentStatus: 'permanent', hireDate: '2025-01-01' }),
  ]
  const order = (sort: RosterSort | null) => [...band].sort(rosterCompare(sort, compareByLadder)).map(p => p.name)

  it('reads in the ladder’s order until a head is pressed', () => {
    expect(order(null)).toEqual(['ANTHONY', 'CHEA HUAN', 'GONE', 'Bella', 'zack', 'INTERN'])
  })

  it('a head pressed reads its first way; pressed again, the other — and another head starts at its own first way', () => {
    expect(nextSort(null, 'name')).toEqual({ key: 'name', dir: 'asc' })
    expect(nextSort({ key: 'name', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'desc' })
    expect(nextSort({ key: 'name', dir: 'desc' }, 'name')).toEqual({ key: 'name', dir: 'asc' })
    expect(nextSort(null, 'title')).toEqual({ key: 'title', dir: 'desc' })
    expect(nextSort({ key: 'title', dir: 'desc' }, 'title')).toEqual({ key: 'title', dir: 'asc' })
    expect(nextSort({ key: 'title', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'asc' })
    expect(nextSort(null, 'rank')).toEqual({ key: 'rank', dir: 'desc' })
    expect(nextSort(null, 'code')).toEqual({ key: 'code', dir: 'asc' })
    expect(nextSort(null, 'employment')).toEqual({ key: 'employment', dir: 'desc' })
    expect(nextSort(null, 'seen')).toEqual({ key: 'seen', dir: 'desc' })
  })

  it('Name: A→Z as people read it, case aside — then Z→A', () => {
    expect(order({ key: 'name', dir: 'asc' })).toEqual(['ANTHONY', 'Bella', 'CHEA HUAN', 'GONE', 'INTERN', 'zack'])
    expect(order({ key: 'name', dir: 'desc' })).toEqual(['zack', 'INTERN', 'GONE', 'CHEA HUAN', 'Bella', 'ANTHONY'])
  })

  it('Title: the most senior first — then the least; a title off the ladder stays last either way', () => {
    expect(order({ key: 'title', dir: 'desc' })).toEqual(order(null))
    // One rung, the ladder's own order inside it (the title, then the HV number).
    expect(order({ key: 'title', dir: 'asc' })).toEqual(['GONE', 'Bella', 'zack', 'ANTHONY', 'CHEA HUAN', 'INTERN'])
  })

  it('Rank: SS above A above B … by the letter, whatever the rate; nobody with no rank last either way', () => {
    expect(order({ key: 'rank', dir: 'desc' })).toEqual(['CHEA HUAN', 'Bella', 'ANTHONY', 'zack', 'GONE', 'INTERN'])
    expect(order({ key: 'rank', dir: 'asc' })).toEqual(['zack', 'ANTHONY', 'Bella', 'CHEA HUAN', 'GONE', 'INTERN'])
    expect(rankSeniority('Rank SS', 0)).toBeGreaterThan(rankSeniority('Rank S', 0.2)!)
    expect(rankSeniority('Rank S', 0)).toBeGreaterThan(rankSeniority('Rank A', 0.12)!)
    expect(rankSeniority('Rank A', 0.04)).toBeGreaterThan(rankSeniority('Rank B', 0.09)!)
    expect(rankSeniority('Rank B', 0.09)).toBeGreaterThan(rankSeniority('Rank B', 0.035)!)
    expect(rankSeniority('Rank F', 0)).toBeGreaterThan(rankSeniority('Director', 0.5)!)
    expect(rankSeniority(null, 0.1)).toBeNull()
  })

  it('Code: from HV001 up — then down; no code last either way', () => {
    expect(order({ key: 'code', dir: 'asc' })).toEqual(['GONE', 'ANTHONY', 'CHEA HUAN', 'Bella', 'zack', 'INTERN'])
    expect(order({ key: 'code', dir: 'desc' })).toEqual(['zack', 'Bella', 'CHEA HUAN', 'ANTHONY', 'GONE', 'INTERN'])
  })

  // 2026-10-23: the column reads the employment status, then the hire date — so it sorts by them.
  it('Employment: probation, part time, permanent, not set, inactive — the latest hire first inside each; then the other way', () => {
    expect(order({ key: 'employment', dir: 'desc' })).toEqual(['zack', 'Bella', 'CHEA HUAN', 'ANTHONY', 'INTERN', 'GONE'])
    expect(order({ key: 'employment', dir: 'asc' })).toEqual(['GONE', 'INTERN', 'ANTHONY', 'CHEA HUAN', 'Bella', 'zack'])
  })

  it('Last seen: the latest sign-in first — then the oldest; never signed in last either way', () => {
    expect(order({ key: 'seen', dir: 'desc' })).toEqual(['CHEA HUAN', 'ANTHONY', 'GONE', 'Bella', 'zack', 'INTERN'])
    expect(order({ key: 'seen', dir: 'asc' })).toEqual(['GONE', 'ANTHONY', 'CHEA HUAN', 'Bella', 'zack', 'INTERN'])
  })

  it('sorts inside each band — the bands keep their own order', () => {
    const groups = rosterGroups([...band, sp({ name: 'AARON', department: 'Director', levelRank: 10 })], rosterCompare({ key: 'name', dir: 'desc' }, compareByLadder))
    expect(groups.map(g => [g.dept, g.rows[0].name])).toEqual([['Director', 'AARON'], ['Revenue', 'zack']])
  })
})
