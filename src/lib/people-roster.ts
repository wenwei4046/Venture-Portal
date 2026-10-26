/**
 * People Management's roster, the arithmetic behind the HR revamp's People
 * tab (2026-10-10): the five cards' counts, the search and the employment
 * filter, the department bands, and the order a pressed column head puts
 * each band in (2026-10-22). Pure, so the page stays thin and this is tested.
 */

import { staffCodeNumber } from './staff-codes'
import type { EmploymentStatus } from './employment-status'

export type RosterStatus = 'active' | 'inactive' | 'all'

/** What a roster row carries that this needs. */
export interface RosterPerson {
  /** Their full name as the roster lists it — last name, then first (`fullNameOf`, 2026-10-20). */
  name: string
  /** The full name on their IC, when it reads otherwise — the search finds them by it too. */
  icName?: string | null
  code: string | null
  title: string | null
  department: string | null
  accountEmail: string | null
  /** Sent an invite link they have not used yet (2026-10-16): a login, but no password to sign in with. */
  invitePending?: boolean
  active: boolean
  missing: string[]
}

export const NO_DEPT = '— No department'

/** The five cards, over the whole roster whatever the filter shows. */
export function rosterCounts(people: readonly RosterPerson[]) {
  const active = people.filter(p => p.active).length
  return {
    total: people.length,
    active,
    inactive: people.length - active,
    // Who can sign in: an invite not yet used is not a way in.
    withLogin: people.filter(p => p.accountEmail && !p.invitePending).length,
    invited: people.filter(p => p.accountEmail && p.invitePending).length,
    incomplete: people.filter(p => p.missing.length > 0).length,
    departments: new Set(people.map(p => p.department ?? NO_DEPT)).size,
  }
}

/**
 * Search (name — as listed or as on their IC — code, title, department or email), the employment filter and
 * the department filter (2026-10-20, the user: "要多加一个 filter … 可以选 department"): '' is every department,
 * `NO_DEPT` the people in none.
 */
export function rosterMatches(p: RosterPerson, query: string, status: RosterStatus, dept = ''): boolean {
  if (status === 'active' && !p.active) return false
  if (status === 'inactive' && p.active) return false
  if (dept && (p.department ?? NO_DEPT) !== dept) return false
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!q) return true
  return [p.name, p.icName, p.code, p.title, p.department, p.accountEmail].some(v => (v ?? '').toLowerCase().replace(/\s+/g, ' ').includes(q))
}

/** The department filter's choices: every department on the roster A→Z, none last, each with how many it holds. */
export function rosterDepartments(people: readonly RosterPerson[]): Array<{ dept: string; count: number }> {
  const counts = new Map<string, number>()
  for (const p of people) {
    const dept = p.department ?? NO_DEPT
    counts.set(dept, (counts.get(dept) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (a === NO_DEPT ? 1 : b === NO_DEPT ? -1 : a.localeCompare(b)))
    .map(([dept, count]) => ({ dept, count }))
}

/**
 * One band per department, A→Z with no department last; inside a band the
 * ladder reads top down (`compare`), and the band counts who is incomplete.
 */
export function rosterGroups<T extends RosterPerson>(people: readonly T[], compare: (a: T, b: T) => number) {
  const map = new Map<string, T[]>()
  for (const p of people) {
    const dept = p.department ?? NO_DEPT
    const list = map.get(dept)
    if (list) list.push(p)
    else map.set(dept, [p])
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === NO_DEPT ? 1 : b === NO_DEPT ? -1 : a.localeCompare(b)))
    .map(([dept, rows]) => ({
      dept,
      rows: [...rows].sort(compare),
      incomplete: rows.filter(p => p.missing.length > 0).length,
    }))
}

/**
 * The columns a press of their head sorts by (2026-10-22, the user, circling
 * the roster's heads: "like press name, will be follow by alpahabe 排法， title
 * will be follow title 高到低 按多一次就低到高").
 */
export type RosterSortKey = 'name' | 'title' | 'rank' | 'code' | 'employment' | 'seen'
export type RosterSort = { key: RosterSortKey; dir: 'asc' | 'desc' }

/**
 * Which way a column reads when first pressed: names A→Z; the most senior
 * title and rank first; codes from HV001; probation first, the latest hire
 * first; the latest sign-in first. Pressed again, the other way.
 */
export const FIRST_WAY: Readonly<Record<RosterSortKey, RosterSort['dir']>> = {
  name: 'asc',
  title: 'desc',
  rank: 'desc',
  code: 'asc',
  employment: 'desc',
  seen: 'desc',
}

/** A column head pressed: its first way — or, when it already sorts the roster, the other way. */
export function nextSort(current: RosterSort | null, key: RosterSortKey): RosterSort {
  if (current?.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: FIRST_WAY[key] }
}

/** What the sort reads of a row, besides what the roster already holds. */
export interface SortablePerson extends RosterPerson {
  /** The rung their title stands on; null off the ladder. */
  levelRank: number | null
  /** Their commission rank — "Rank B" — and its rate, 0.09 = 9%. */
  rankLabel?: string | null
  rankRate?: number | null
  lastSeenAt: string | null
  /** Probation, Permanent or Part time (2026-10-23); null not set; absent for a reader not shown it. */
  employmentStatus?: EmploymentStatus | null
  hireDate?: string | null
}

/**
 * Where the Employment column puts somebody: on probation first — a review is coming — then on a contract (the other
 * with an end, 2026-10-24), part time, permanent, not set, inactive.
 */
const EMPLOYMENT_RANK: Readonly<Record<EmploymentStatus, number>> = { probation: 5, contract: 4, part_time: 3, permanent: 2 }
const employmentRank = (p: SortablePerson) => (!p.active ? 0 : p.employmentStatus ? EMPLOYMENT_RANK[p.employmentStatus] : 1)

/**
 * How senior a commission rank reads: SS above S above A, then B, C … — the
 * letter, not the rate. Two schemes are in use (2026-10-22) and their rates
 * differ (Rank A at 4% in one, Rank B at 9% in the other, Rank SS at 0%), so
 * the letter is what reads the same in both. A rank named otherwise reads
 * below the letters; the rate decides between the same letters.
 */
export function rankSeniority(label: string | null | undefined, rate?: number | null): number | null {
  if (!label) return null
  const mark = label.replace(/^rank\s+/i, '').trim().toUpperCase()
  const weight = /^S+$/.test(mark) ? 100 + mark.length : /^[A-Z]$/.test(mark) ? 91 - mark.charCodeAt(0) : 0
  return weight + Math.min(Math.max(rate ?? 0, 0), 0.999)
}

/** The value each column sorts by; null — no rung, no rank, no code, never signed in — stands last whichever way. */
const SORT_VALUE: Readonly<Record<RosterSortKey, (p: SortablePerson) => number | string | null>> = {
  name: p => p.name,
  title: p => p.levelRank,
  rank: p => rankSeniority(p.rankLabel, p.rankRate),
  code: p => staffCodeNumber(p.code),
  // What the column shows (2026-10-23): the status, then the hire date — the latest hire first inside each.
  employment: p => `${employmentRank(p)}|${p.hireDate ?? '0000-00-00'}`,
  seen: p => (p.lastSeenAt ? Date.parse(p.lastSeenAt) : null),
}

/**
 * The order inside each band for a sort — none: the ladder's (`ladder`, which
 * is also how a tie reads, so people with the same value still stand top
 * down). Names compare as people read them, case aside.
 */
export function rosterCompare<T extends SortablePerson>(sort: RosterSort | null, ladder: (a: T, b: T) => number): (a: T, b: T) => number {
  if (!sort) return ladder
  const value = SORT_VALUE[sort.key]
  const sign = sort.dir === 'asc' ? 1 : -1
  return (a, b) => {
    const va = value(a)
    const vb = value(b)
    if (va === null || vb === null) {
      if (va !== vb) return va === null ? 1 : -1
    } else {
      const by = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' })
      if (by !== 0) return sign * by
    }
    return ladder(a, b)
  }
}

/** "LW" for LOO WEN WEI — the row's tile and the window's. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()
}
