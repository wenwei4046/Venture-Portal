// Replace Person (④-5, `Replace Person.dc.html`; the user's answers 24–28): where a Marketing person stands, as
// mkt_replace_places reads it — the templates, a series' plan, stages not started, the work in their hands, approvals
// under way, the projects they own — in the page's words; what a swap to somebody would do to each place (only taken off
// where the one taking over is listed already; refused on an approval under way they hold already); the preview, what
// stops Replace, and the record afterwards. Pure.

import { shortDay } from './board'
import type { PickPerson } from './tasks'

export type ReplaceGroup = 'tpl' | 'series' | 'up' | 'hand' | 'appr' | 'own'
export type ReplaceRole = 'template' | 'series' | 'owner' | 'cand' | 'appr' | 'subtask' | 'project'
export type ReplaceTone = 'done' | 'waiting' | 'draft'

/** A stage of a template or a series' plan that names them, and how. */
export interface ReplaceAt {
  n: number
  stage: string
  role: 'owner' | 'cand' | 'appr'
}

/** One place a person stands — and, once replaced, what came of it. */
export interface ReplacePlace {
  key: string
  grp: ReplaceGroup
  role: ReplaceRole
  /** The project (or the template) it is on. */
  ref: string
  track: string
  /** A project's title; a template's action. */
  title: string
  tname: string
  kind: string
  status: string
  /** A stage's name and number (1-based; 0 for none). */
  stage: string
  n: number
  starts: string | null
  due: string | null
  ver: number
  late: boolean
  owner: string | null
  cands: string[]
  /** A stage's approvers, people only, level by level. */
  appr: string[]
  level: number
  waiting: boolean
  subtask: string
  /** A template's or a series' stages that name them. */
  at: ReplaceAt[]
  /** A template's version now, and whether its draft has edits of its own. */
  version: number
  drafted: boolean
  /** A project owned that is a series. */
  series: boolean
  /** Once replaced: the one taking over was listed already (the one replaced only taken off); a template's new version. */
  dupe: boolean
  published: number | null
}

export interface ReplacePlaces {
  person: { id: string; full: string; first: string }
  places: ReplacePlace[]
}

/** Somebody with places, as mkt_replace_people counts them. */
export interface ReplaceCount {
  id: string
  full: string
  first: string
  places: number
}

/** A person on step 1: the roster's, with their places — and anybody else who still has some (left the roster). */
export interface ReplaceWho {
  id: string
  first: string
  full: string
  title: string
  places: number
}

/** A replacement done (mkt_replace_person): the record. */
export interface ReplaceDone {
  rec: number
  at: string
  by: string
  from: { id: string; first: string }
  to: { id: string; first: string }
  reason: string
  done: ReplacePlace[]
  kept: ReplacePlace[]
  gone: number
}

/** The groups, in the handoff's order and words (theirs — the person's first name — never "her"). */
export const REPLACE_GROUPS: readonly { key: ReplaceGroup; title: (first: string) => string; hint: string }[] = [
  { key: 'tpl', title: () => 'Workflow templates', hint: 'Future projects' },
  { key: 'series', title: () => 'Recurring series', hint: 'Runs to come' },
  { key: 'up', title: () => 'Upcoming stages in active projects', hint: 'Not started yet' },
  { key: 'hand', title: f => `In ${f}’s hands now`, hint: 'Will need Accept again' },
  { key: 'appr', title: () => 'Approvals under way', hint: 'Waiting now or to come' },
  { key: 'own', title: f => `Projects ${f} owns`, hint: 'Owner' },
]

/** The reasons offered (answer 28 — no swap back after a leave: no *Long leave*); any other is typed. */
export const REPLACE_REASONS = ['Resigned', 'Transferred', 'Workload'] as const

export const reasonOk = (r: string) => r.trim().length >= 3 && r.trim().length <= 200

/** "R-0042" — the record's number. */
export const recNo = (rec: number) => `R-${String(rec).padStart(4, '0')}`

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const GROUPS = new Set<ReplaceGroup>(['tpl', 'series', 'up', 'hand', 'appr', 'own'])
const ROLES = new Set<ReplaceRole>(['template', 'series', 'owner', 'cand', 'appr', 'subtask', 'project'])

function placeFromRow(v: unknown): ReplacePlace | null {
  if (!isObj(v) || !str(v.key) || !GROUPS.has(v.grp as ReplaceGroup) || !ROLES.has(v.role as ReplaceRole)) return null
  const at = (Array.isArray(v.at) ? v.at : []).filter(isObj)
    .map(a => ({ n: num(a.n), stage: str(a.stage), role: (a.role === 'owner' || a.role === 'cand' ? a.role : 'appr') as ReplaceAt['role'] }))
    .sort((a, b) => a.n - b.n || a.role.localeCompare(b.role))
  return {
    key: str(v.key), grp: v.grp as ReplaceGroup, role: v.role as ReplaceRole, ref: str(v.ref),
    track: str(v.track), title: str(v.title) || str(v.action), tname: str(v.tname), kind: str(v.kind), status: str(v.status),
    stage: str(v.stage), n: typeof v.idx === 'number' ? v.idx + 1 : 0, starts: strOrNull(v.starts), due: strOrNull(v.due), ver: num(v.ver),
    late: v.late === true, owner: strOrNull(v.owner), cands: ids(v.cands), appr: ids(v.appr), level: num(v.level), waiting: v.waiting === true,
    subtask: str(v.subtask), at, version: num(v.version), drafted: v.drafted === true, series: v.series === true,
    dupe: v.dupe === true, published: typeof v.published === 'number' ? v.published : null,
  }
}
const placesOf = (v: unknown) => (Array.isArray(v) ? v.map(placeFromRow).filter((p): p is ReplacePlace => !!p) : [])

/** mkt_replace_places(staff): the person and their places, or null — nobody. */
export function replacePlacesFromRow(v: unknown): ReplacePlaces | null {
  if (!isObj(v) || !isObj(v.person) || !str(v.person.id)) return null
  return { person: { id: str(v.person.id), full: str(v.person.full), first: str(v.person.first) || str(v.person.full) }, places: placesOf(v.places) }
}

/** mkt_replace_people(): each person with places, and how many. */
export function replaceCountsFromRow(v: unknown): ReplaceCount[] {
  return (Array.isArray(v) ? v : []).filter(isObj).filter(x => str(x.id))
    .map(x => ({ id: str(x.id), full: str(x.full), first: str(x.first) || str(x.full), places: num(x.places) }))
}

/** mkt_replace_person: the record. */
export function replaceDoneFromRow(v: unknown): ReplaceDone | null {
  if (!isObj(v) || typeof v.rec !== 'number' || !isObj(v.from) || !isObj(v.to)) return null
  return {
    rec: v.rec, at: str(v.at), by: str(v.by),
    from: { id: str(v.from.id), first: str(v.from.first) }, to: { id: str(v.to.id), first: str(v.to.first) },
    reason: str(v.reason), done: placesOf(v.done), kept: placesOf(v.kept), gone: num(v.gone),
  }
}

/** Step 1's people: the roster's (with their places, none for most), and anybody else who still has some — most
 * places first, then by name. */
export function replaceWho(team: readonly { id: string; first: string; full: string; title: string | null }[], counts: readonly ReplaceCount[]): ReplaceWho[] {
  const n = new Map(counts.map(c => [c.id, c.places]))
  const out: ReplaceWho[] = team.map(p => ({ id: p.id, first: p.first || p.full, full: p.full, title: p.title ?? '', places: n.get(p.id) ?? 0 }))
  for (const c of counts) if (!team.some(p => p.id === c.id)) out.push({ id: c.id, first: c.first, full: c.full, title: 'Not on the roster', places: c.places })
  return out.sort((a, b) => b.places - a.places || a.first.localeCompare(b.first))
}

/** "3 active" — what is on a person's plate, from the pickers' hint ("TITLE · 3 active"); the title shows on hover. */
export const activeOf = (hint: string) => hint.split(' · ').pop() ?? ''

/** Who may take over (answer 25 — anybody on the roster), the one replaced's own group first. */
export function replaceTakers(people: readonly PickPerson[], from: string): PickPerson[] {
  const group = people.find(p => p.id === from)?.group ?? ''
  return people.filter(p => p.id !== from).sort((a, b) => Number(b.group === group) - Number(a.group === group))
}

const ROLE_WORDS: Record<ReplaceAt['role'], string> = { owner: 'does it', cand: 'a 🔓 candidate', appr: 'approves' }
const STATUS_WORDS: Record<string, string> = { todo: 'to Accept', accepted: 'accepted', changes: 'changes asked', review: 'in review' }

/** A place in the page's words: what it is, how they stand there, and when. */
export function placeWords(p: ReplacePlace, nameOf: (id: string) => string): { title: string; detail: string; meta: string | null; red: boolean } {
  const day = (d: string | null) => (d ? shortDay(d) : '')
  const stages = p.at.map(a => `Stage ${a.n} ${a.stage} — ${ROLE_WORDS[a.role]}`).join(' · ')
  switch (p.role) {
    case 'template':
      return { title: `${p.title} · ${p.tname}${p.version ? ` v${p.version}` : ' · draft'}`,
        detail: `${stages}${p.drafted ? ' · its draft has edits not yet published' : ''}`, meta: null, red: false }
    case 'series':
      return { title: `${p.title} — its runs to come`, detail: stages, meta: p.track, red: false }
    case 'subtask':
      return { title: `${p.subtask} — ${p.track}`, detail: `${p.title} · ${p.stage} stage`, meta: p.due ? `due ${day(p.due)}` : null, red: p.late }
    case 'project':
      return { title: p.title, detail: `${p.track} · ${p.series ? 'a series — its runs to come too' : 'Owner'}`, meta: p.due ? `due ${day(p.due)}` : null,
        red: false }
    default: {
      const title = `${p.title} — Stage ${p.n} ${p.stage}`
      if (p.role === 'cand') return { title, detail: `One of ${p.cands.length} 🔓 candidates (${p.cands.map(nameOf).join(' / ')})`, meta: p.starts ? `starts ${day(p.starts)}` : null, red: false }
      if (p.role === 'appr') {
        return { title, detail: `Approval level ${p.level}${p.appr.length > 1 ? ` of ${p.appr.length}` : ''}`,
          meta: p.waiting ? 'waiting now' : p.grp === 'up' && p.starts ? `starts ${day(p.starts)}` : null, red: false }
      }
      if (p.grp === 'up') return { title, detail: 'Doing it', meta: p.starts ? `starts ${day(p.starts)}` : null, red: false }
      return { title, detail: `Doing it · ${STATUS_WORDS[p.status] ?? p.status}`, meta: p.due ? `due ${day(p.due)}` : null, red: p.late }
    }
  }
}

/** What a swap to `to` does to a place beyond the swap itself: the one taking over listed already (the one replaced only
 * taken off) — or refused, on an approval under way they hold already. */
export function swapNote(p: ReplacePlace, to: { id: string; first: string } | null, from: string): { text: string; refused: boolean } | null {
  if (!to) return null
  if (p.role === 'cand' && p.cands.includes(to.id)) return { text: `${to.first} is already a candidate — ${from} will just be removed`, refused: false }
  if (p.role === 'appr' && p.appr.includes(to.id)) {
    return p.grp === 'appr'
      ? { text: `${to.first} already approves this stage — untick it, or pick somebody else`, refused: true }
      : { text: `${to.first} already approves this stage — ${from}’s level is removed`, refused: false }
  }
  return null
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "Hafiz takes over 5 of 6: 1 template, 2 upcoming stages, 2 in hand. 1 stays with Siti." */
export function replacePreview(places: readonly ReplacePlace[], picked: ReadonlySet<string>, to: string | null, from: string): string {
  const on = places.filter(p => picked.has(p.key))
  if (!on.length) return 'Nothing selected.'
  const n = (g: ReplaceGroup) => on.filter(p => p.grp === g).length
  const parts = [
    n('tpl') && plural(n('tpl'), 'template'), n('series') && plural(n('series'), 'series', 'series'),
    n('up') && plural(n('up'), 'upcoming stage'), n('hand') && `${n('hand')} in hand`, n('appr') && plural(n('appr'), 'approval'),
    n('own') && plural(n('own'), 'project'),
  ].filter(Boolean)
  const rest = places.length - on.length
  return `${to || '…'} takes over ${on.length} of ${places.length}: ${parts.join(', ')}.${rest ? ` ${rest} stay${rest === 1 ? 's' : ''} with ${from}.` : ''}`
}

/** What stops Replace, first thing first — or null. */
export function replaceBlock(picked: number, to: { id: string; first: string } | null, reason: string, refused: readonly string[]): string | null {
  if (!picked) return 'Tick at least one place'
  if (!to) return 'Pick who takes over'
  if (!reasonOk(reason)) return 'A reason is required'
  if (refused.length) return `${to.first} already approves ${plural(refused.length, 'stage')} under way — untick ${refused.length === 1 ? 'it' : 'them'}, or pick somebody else`
  return null
}

/** Step 4: a row each place — changed, or staying with them. */
export function replaceResults(d: ReplaceDone, nameOf: (id: string) => string): { key: string; title: string; group: string; change: string; status: string; tone: ReplaceTone; kept: boolean }[] {
  const group = (g: ReplaceGroup) => REPLACE_GROUPS.find(x => x.key === g)?.title(d.from.first) ?? ''
  const change = (p: ReplacePlace) => (p.dupe ? `${d.from.first} removed (${d.to.first} already listed)` : `${d.from.first} → ${d.to.first}`)
  const status = (p: ReplacePlace): { status: string; tone: ReplaceTone } => {
    if (p.grp === 'tpl') return p.published ? { status: `Published v${p.published}`, tone: 'done' } : { status: 'Draft updated', tone: 'done' }
    if (p.grp === 'series') return { status: 'Runs to come updated', tone: 'done' }
    if (p.grp === 'up') return { status: 'Assigned · not started', tone: 'draft' }
    if (p.grp === 'appr') return p.waiting ? { status: `Waiting for ${d.to.first}’s approval`, tone: 'waiting' } : { status: 'Approver updated', tone: 'done' }
    if (p.grp === 'own') return { status: 'Owner updated', tone: 'done' }
    if (p.role === 'owner' && (p.status === 'todo' || p.status === 'accepted')) return { status: `Waiting for ${d.to.first} to Accept`, tone: 'waiting' }
    return { status: `With ${d.to.first}`, tone: 'done' }
  }
  return [
    ...d.done.map(p => ({ key: p.key, title: placeWords(p, nameOf).title, group: group(p.grp), change: change(p), ...status(p), kept: false })),
    ...d.kept.map(p => ({ key: p.key, title: placeWords(p, nameOf).title, group: group(p.grp), change: 'No change', status: `Stays with ${d.from.first}`,
      tone: 'draft' as ReplaceTone, kept: true })),
  ]
}

/** The stages now theirs to Accept — moved to My Space with an Accept button, their deadlines unchanged. */
export const toAccept = (d: ReplaceDone) => d.done.filter(p => p.grp === 'hand' && p.role === 'owner' && (p.status === 'todo' || p.status === 'accepted')).length
