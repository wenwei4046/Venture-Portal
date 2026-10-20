/**
 * People Management's roster, the arithmetic behind the HR revamp's People
 * tab (2026-10-10): the five cards' counts, the search and the employment
 * filter, the department bands. Pure, so the page stays thin and this is
 * tested.
 */

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
