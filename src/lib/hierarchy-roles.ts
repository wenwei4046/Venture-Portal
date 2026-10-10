/**
 * Hierarchy's People & roles and Levels as the HR revamp draws them
 * (2026-10-10, the handoff's variant A): a band per title — its level, how
 * many hold it, its permission template — over the people holding it; and the
 * ladder as rows, top rung first, each with its titles as coloured chips.
 * Pure, so the tabs stay thin and this is tested.
 */

/** A title as the two tabs need it. */
export interface RoleTitle {
  id: string
  name: string
  departmentId: string | null
  departmentName: string | null
  levelId: string | null
  isActive: boolean
  isDepartmentHead: boolean
  templateId: string | null
  templateName: string | null
}

export interface RoleRung {
  id: string
  rank: number
  name: string
}

/** Somebody on the roster, by the title they hold. */
export interface RolePerson {
  id: string
  name: string
  titleId: string | null
  department: string | null
  reportsTo: string | null
}

/** The handoff's chip colours: four titles of its own, every other one blue. */
const TONES: Record<string, readonly [string, string]> = {
  'team leader': ['240 232 250', '110 70 160'],
  'team assistant': ['253 232 233', '170 60 70'],
  'senior revenue specialist': ['255 236 214', '160 90 30'],
  'revenue specialist': ['246 240 230', '120 95 70'],
}
const DEFAULT_TONE = ['232 239 247', '46 92 138'] as const

/** A title's chip: [background, letters], as `r g b` triplets. */
export function titleTone(name: string): readonly [string, string] {
  return TONES[name.trim().toLowerCase()] ?? DEFAULT_TONE
}

/** "L9" — or "—" for a title not on the ladder. */
export function levelLabel(rank: number | null | undefined): string {
  return rank == null ? '—' : `L${rank}`
}

export interface RoleBand {
  title: RoleTitle
  rank: number | null
  people: Array<RolePerson & { manager: string | null }>
}

/**
 * People & roles: one band per title, the most senior first (no rung last),
 * A→Z on a rung; inside a band its holders A→Z with who they report to.
 */
export function roleBands(titles: readonly RoleTitle[], rungs: readonly RoleRung[], people: readonly RolePerson[]): RoleBand[] {
  const rankOf = new Map(rungs.map(r => [r.id, r.rank]))
  const nameOf = new Map(people.map(p => [p.id, p.name]))
  const byTitle = new Map<string, RolePerson[]>()
  for (const p of people) {
    if (!p.titleId) continue
    const list = byTitle.get(p.titleId)
    if (list) list.push(p)
    else byTitle.set(p.titleId, [p])
  }
  return titles
    .map(t => ({
      title: t,
      rank: t.levelId ? (rankOf.get(t.levelId) ?? null) : null,
      people: [...(byTitle.get(t.id) ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(p => ({ ...p, manager: p.reportsTo ? (nameOf.get(p.reportsTo) ?? null) : null })),
    }))
    .sort((a, b) => (b.rank ?? -1) - (a.rank ?? -1) || a.title.name.localeCompare(b.title.name))
}

export interface LevelRow {
  rung: RoleRung | null
  titles: Array<{ title: RoleTitle; people: number }>
}

/**
 * Levels: every rung, the top first, with the titles standing on it (A→Z, a
 * count of who holds each); then, if any, the titles on no rung yet.
 */
export function levelRows(rungs: readonly RoleRung[], titles: readonly RoleTitle[], people: readonly RolePerson[]): LevelRow[] {
  const held = new Map<string, number>()
  for (const p of people) if (p.titleId) held.set(p.titleId, (held.get(p.titleId) ?? 0) + 1)
  const on = (levelId: string | null) =>
    titles
      .filter(t => t.levelId === levelId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(title => ({ title, people: held.get(title.id) ?? 0 }))
  const known = new Set(rungs.map(r => r.id))
  const rows: LevelRow[] = [...rungs].sort((a, b) => b.rank - a.rank).map(rung => ({ rung, titles: on(rung.id) }))
  const unplaced = titles
    .filter(t => !t.levelId || !known.has(t.levelId))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(title => ({ title, people: held.get(title.id) ?? 0 }))
  return unplaced.length ? [...rows, { rung: null, titles: unplaced }] : rows
}
