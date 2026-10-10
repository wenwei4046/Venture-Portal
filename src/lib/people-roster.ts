/**
 * People Management's roster, the arithmetic behind the HR revamp's People
 * tab (2026-10-10): the five cards' counts, the search and the employment
 * filter, the department bands. Pure, so the page stays thin and this is
 * tested.
 */

export type RosterStatus = 'active' | 'inactive' | 'all'

/** What a roster row carries that this needs. */
export interface RosterPerson {
  name: string
  code: string | null
  title: string | null
  department: string | null
  accountEmail: string | null
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
    withLogin: people.filter(p => p.accountEmail).length,
    incomplete: people.filter(p => p.missing.length > 0).length,
    departments: new Set(people.map(p => p.department ?? NO_DEPT)).size,
  }
}

/** Search (name, code, title, department or email) and the employment filter. */
export function rosterMatches(p: RosterPerson, query: string, status: RosterStatus): boolean {
  if (status === 'active' && !p.active) return false
  if (status === 'inactive' && p.active) return false
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [p.name, p.code, p.title, p.department, p.accountEmail].some(v => (v ?? '').toLowerCase().includes(q))
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
