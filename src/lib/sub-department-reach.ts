/**
 * Sub-departments per person (2026-10-16 — the owner: "1, this follow by this
 * handle department, as default", then "在 CRM 权限那边，应该可以让我去打勾，它是
 * 按 sub-department 去打勾的…包括 revenue team 本身也是要分 sub-department，根据
 * 权限的 tab 来 view").
 *
 * Each person reaches, area by area, some of the Revenue Department's
 * sub-departments: by default the ones they HANDLE (its director, or a member
 * of it today) — every one for somebody who handles none (the company's level:
 * the CEO, the directors, HR, the office) — and one person may be ticked on or
 * off a sub-department over that, as their boxes are kept over their
 * template's ticks. The database works it out (`my_sub_department_reach()`,
 * mig 20261016180000) and the CRM asks it there; this is the app's side: which
 * permission rows carry the ticks, what the pages and the sidebar open, and a
 * person's window. Pure.
 */

export const REACH_AREAS = ['crm', 'comm_cal', 'sales_groups', 'rules'] as const
export type ReachArea = (typeof REACH_AREAS)[number]

/** The sub-department ids a person reaches, area by area. */
export type Reach = Readonly<Record<ReachArea, readonly string[]>>

/** Nothing reached anywhere — what a sign-in whose reach could not be read gets (fail closed). */
export const NO_REACH: Reach = { crm: [], comm_cal: [], sales_groups: [], rules: [] }

export function isReachArea(value: unknown): value is ReachArea {
  return typeof value === 'string' && (REACH_AREAS as readonly string[]).includes(value)
}

/** The permission matrix's rows that carry sub-department ticks, and the area each stands for. */
export const AREA_OF_TAB: Readonly<Record<string, ReachArea>> = {
  'hr.comm_cal': 'comm_cal',
  'hr.sales_groups': 'sales_groups',
  'hr.rules': 'rules',
  // The CRM is one area: being in it (My leads & appointments) and running it (CRM · Team).
  'rev.leads': 'crm',
  'rev.crm_team': 'crm',
}

/** A Revenue page's view (the switcher's names) → its area. */
export const AREA_OF_VIEW = { cc: 'comm_cal', sg: 'sales_groups', rules: 'rules' } as const satisfies Record<'cc' | 'sg' | 'rules', ReachArea>

/** `my_sub_department_reach()`'s answer → a Reach; anything else (an error, no sign-in) reaches nothing. */
export function reachFromJson(json: unknown): Reach {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return NO_REACH
  const raw = json as Record<string, unknown>
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  return { crm: ids(raw.crm), comm_cal: ids(raw.comm_cal), sales_groups: ids(raw.sales_groups), rules: ids(raw.rules) }
}

/**
 * Does this reach take in the sub-department? No reach at all (a session built
 * without one — the tests' users) narrows nothing; every real sign-in carries
 * one (lib/auth.ts).
 */
export function reachesSub(reach: Reach | null | undefined, area: ReachArea, subId: string): boolean {
  return !reach || reach[area].includes(subId)
}

/** The sub-departments of a list the reach takes in, in the list's order. */
export function subsInReach<T extends { id: string }>(subs: readonly T[], reach: Reach | null | undefined, area: ReachArea): T[] {
  return subs.filter(s => reachesSub(reach, area, s.id))
}

// ── A person's window ───────────────────────────────────────────────────────

/** One sub-department ticked on (`granted`) or off for one person in one area — `user_sub_department_reach`. */
export interface ReachTick {
  area: ReachArea
  sub: string
  granted: boolean
}

/** What their window draws from: the active sub-departments, the ones they handle, and their own ticks. */
export interface PersonReach {
  subs: Array<{ id: string; name: string }>
  handled: string[]
  ticks: ReachTick[]
}

/** `person_sub_department_reach(p_user)`'s answer → PersonReach (a tick naming an unknown area or sub is dropped). */
export function personReachFromJson(json: unknown): PersonReach {
  const raw = (json && typeof json === 'object' && !Array.isArray(json) ? json : {}) as Record<string, unknown>
  const subs = (Array.isArray(raw.subs) ? raw.subs : []).flatMap(s => {
    const r = s as { id?: unknown; name?: unknown }
    return typeof r?.id === 'string' && typeof r?.name === 'string' ? [{ id: r.id, name: r.name }] : []
  })
  const known = new Set(subs.map(s => s.id))
  const handled = (Array.isArray(raw.handled) ? raw.handled : []).filter((x): x is string => typeof x === 'string' && known.has(x))
  const ticks = (Array.isArray(raw.ticks) ? raw.ticks : []).flatMap(t => {
    const r = t as { area?: unknown; sub?: unknown; granted?: unknown }
    return isReachArea(r?.area) && typeof r?.sub === 'string' && known.has(r.sub) && typeof r?.granted === 'boolean'
      ? [{ area: r.area, sub: r.sub, granted: r.granted }]
      : []
  })
  return { subs, handled, ticks }
}

/** Their reach before any tick of their own: what they handle, every sub-department when they handle none. */
export function defaultReach(person: Pick<PersonReach, 'subs' | 'handled'>): Set<string> {
  return new Set(person.handled.length > 0 ? person.handled : person.subs.map(s => s.id))
}

/** What they reach in an area: the default with their ticks over it. */
export function reachOf(person: PersonReach, ticks: readonly ReachTick[], area: ReachArea): Set<string> {
  const out = defaultReach(person)
  for (const t of ticks) {
    if (t.area !== area) continue
    if (t.granted) out.add(t.sub)
    else out.delete(t.sub)
  }
  return new Set(person.subs.map(s => s.id).filter(id => out.has(id)))
}

/** One sub-department clicked in an area: flipped, and a tick that lands back on the default is no tick at all. */
export function toggleReach(person: PersonReach, ticks: readonly ReachTick[], area: ReachArea, sub: string): ReachTick[] {
  const on = reachOf(person, ticks, area).has(sub)
  const rest = ticks.filter(t => !(t.area === area && t.sub === sub))
  return defaultReach(person).has(sub) === !on ? rest : [...rest, { area, sub, granted: !on }]
}

/** Their ticks, in one order — what a save sends and what "changed?" compares. */
export function sortedTicks(ticks: readonly ReachTick[]): ReachTick[] {
  return [...ticks].sort((a, b) => a.area.localeCompare(b.area) || a.sub.localeCompare(b.sub))
}

export function sameReachTicks(a: readonly ReachTick[], b: readonly ReachTick[]): boolean {
  const x = sortedTicks(a)
  const y = sortedTicks(b)
  return x.length === y.length && x.every((t, i) => t.area === y[i].area && t.sub === y[i].sub && t.granted === y[i].granted)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A person's ticks as their window sends them: an area, a sub-department id, on or off — each pair once, at most 200. */
export function isReachTickList(ticks: unknown): ticks is ReachTick[] {
  if (!Array.isArray(ticks) || ticks.length > 200) return false
  const seen = new Set<string>()
  return ticks.every(t => {
    const r = t as Partial<ReachTick> | null
    if (!r || !isReachArea(r.area) || typeof r.sub !== 'string' || !UUID.test(r.sub) || typeof r.granted !== 'boolean') return false
    const key = `${r.area}:${r.sub}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Is a sub-department changed for them alone in this area (the red dot)? */
export function tickedFor(ticks: readonly ReachTick[], area: ReachArea, sub: string): boolean {
  return ticks.some(t => t.area === area && t.sub === sub)
}
