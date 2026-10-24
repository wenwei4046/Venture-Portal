// A quick or recurring task's stages (mig 20261023234000): New Project's quick Workflow Builder — each stage's name,
// team, person, working days, approval levels, where changes go back to and the fields it fills in — the dates they
// make, what a stage still needs before it is handed on, and the stages as mkt_task_create takes them. The dates and
// the needs are reckoned exactly as the database reckons them (mkt_stage_dates, mkt_stage_missing). Pure.

import { addDays, approverNow, longDay, runsStages, weekdayOf, type MktBoard, type MktGroup, type MktPerson } from './board'
import { groupOf, isManagerTitle, type MktTone } from './groups'

export const FIELD_TYPES = ['Text', 'Number', 'Select', 'Multi-select', 'Date', 'Person', 'File', 'Checkbox', 'Table', 'Note'] as const
export type FieldType = (typeof FIELD_TYPES)[number]
export const COL_TYPES = ['Text', 'Number', 'Checkbox', 'Date', 'Person'] as const
export type ColType = (typeof COL_TYPES)[number]
export const FIELD_GLYPH: Record<FieldType, string> = {
  Table: '▤', Note: '✎', Text: 'Aa', Select: '◉', 'Multi-select': '☰', Date: '▦', Person: '◎', File: '⎘', Checkbox: '☑', Number: '#',
}

/** New Project's Type: what kind of work the task is (a word of the task's, not a group — groups are People's titles). */
export type TaskType = 'ads' | 'social' | 'content' | 'brand' | 'other'
export const TASK_TYPES: readonly { key: TaskType; label: string }[] = [
  { key: 'ads', label: 'Ads' },
  { key: 'social', label: 'Social Media' },
  { key: 'content', label: 'Content (Video)' },
  { key: 'brand', label: 'Brand' },
  { key: 'other', label: 'Other' },
]

export interface FormField {
  label: string
  type: FieldType
  /** A table's columns. */
  cols?: { name: string; type: ColType }[]
  /** A workflow table's preset rows, a cell per column: one filled in is fixed for the team, a blank one is theirs. */
  rows?: string[][]
  /** A workflow template's canvas (lib/marketing/canvas.ts): required before its stage submits (unset = yes, a note never). */
  req?: boolean
  /** …shown to the PIC on the link (unset = yes). */
  pic?: boolean
  /** …a date on the calendar. */
  cal?: FieldCal | null
  /** …a choice's options. */
  opts?: string[]
  /** …or a shared list's, by its name (③d-2 — the user's answer 9: *Locations*): the field's own options are then unused. */
  list?: string
  /** A deliverable's field from one of its canvas's own sections (②b-2a): that section's title. */
  section?: string
}

/** The kinds of date a field may put on the calendar (2026-10-24 — the user's answer 16: "要，固定种类"; 15: a post is a
 * deliverable with a Post day) — each its name there, its glyph and its colour. */
export type CalKind = 'post' | 'shoot' | 'meeting' | 'ads_live' | 'ads_end' | 'report'
export const CAL_KINDS: readonly { key: CalKind; label: string; glyph: string; tone: MktTone }[] = [
  { key: 'post', label: 'Post day', glyph: '📣', tone: 'social' },
  { key: 'shoot', label: 'Shoot day', glyph: '🎬', tone: 'content' },
  { key: 'meeting', label: 'Meeting', glyph: '🗓️', tone: 'manager' },
  { key: 'ads_live', label: 'Ads go-live', glyph: '📈', tone: 'ads' },
  { key: 'ads_end', label: 'Ads end', glyph: '🛑', tone: 'ads' },
  { key: 'report', label: 'Report day', glyph: '📊', tone: 'brand' },
]
export const calKind = (k: CalKind) => CAL_KINDS.find(c => c.key === k) ?? CAL_KINDS[0]

/** A date's mark on the calendar: which kind of date it is, and whether the PIC's calendar shows it. */
export interface FieldCal {
  kind: CalKind
  pic: boolean
}

/** A calendar mark as the database keeps it — a kind it knows, else none. */
export function calOf(v: unknown): FieldCal | null {
  if (!isObj(v)) return null
  const kind = CAL_KINDS.find(c => c.key === v.kind)?.key
  return kind ? { kind, pic: v.pic === true } : null
}

export interface WorkLink {
  url: string
  label: string
}

/** A file of a stage's work (②b-2e, mig 20261025113000): sent to the bucket under stage/ — a File field's, or the
 * stage's own Files. */
export interface StageFile {
  path: string
  name: string
  size: number
  mime: string
  /** The File field it fills; null: the stage's own Files. */
  field: string | null
  /** Who sent it and when (the handoff's "Uploaded by Ali · 25 Oct"). */
  by: string
  at: string | null
}

/** A stage's work as its owner fills it in. */
export interface StageWork {
  notes: string
  links: WorkLink[]
  /** Each field's answer: a text, a tick — a Multi-select's picks (③d-2). */
  vals: Record<string, string | boolean | string[]>
  files: StageFile[]
}

/** A stage on New Project's form. */
export interface DraftStage {
  key: string
  name: string
  /** Its group: its person's People title. */
  dept: MktGroup
  /** The person who does it (People id). */
  who: string | null
  sla: number
  /** Who approves it, in order (People ids), at most three. */
  appr: string[]
  form: FormField[]
  /** The earlier stage changes go back to; null = stay on this stage. */
  back: number | null
}

export const MAX_STAGES = 20
export const MAX_APPROVALS = 3
export const MAX_SLA = 30

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Each stage's first and last day: the first starts on `base`, each is due its SLA in working days after the one
 * before (the first, after `base`); a later stage starts the working day after the one before is due. Working days
 * are Monday to Friday less the holidays given. */
export function stageDates(base: string, slas: readonly number[], holidays: ReadonlySet<string>): { idx: number; startsOn: string; dueOn: string }[] {
  const work = (d: string) => weekdayOf(d) < 5 && !holidays.has(d)
  const out: { idx: number; startsOn: string; dueOn: string }[] = []
  let day = base
  slas.forEach((sla, idx) => {
    let start = base
    if (idx > 0) {
      start = addDays(day, 1)
      while (!work(start)) start = addDays(start, 1)
    }
    for (let left = Math.max(1, Math.trunc(sla) || 1); left > 0; ) {
      day = addDays(day, 1)
      if (work(day)) left -= 1
    }
    out.push({ idx, startsOn: start, dueOn: day })
  })
  return out
}

/** What a stage still needs before it is handed on: each field not filled in (a box not ticked) — a note and a table
 * are not asked for; a File field is filled by a link or a file of its own; a stage with no field, a note, a file or a
 * link (as mkt_stage_missing). Empty = ready. */
export function missingWork(form: readonly FormField[], work: StageWork): string[] {
  const inputs = form.filter(f => f.type !== 'Note' && f.type !== 'Table')
  const out = inputs
    .filter(f => {
      // A field its template marks not required is never asked for (as mkt_stage_missing).
      if (f.req === false) return false
      if (f.type === 'File' && work.files.some(x => x.field === f.label)) return false
      const v = work.vals[f.label]
      return v === undefined || v === false || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0)
    })
    .map(f => f.label)
  if (inputs.length === 0 && !work.notes.trim() && work.links.length === 0 && work.files.length === 0) out.push('a note, a file or a link')
  return out
}

export const EMPTY_WORK: StageWork = { notes: '', links: [], vals: {}, files: [] }

/** A stage's form as the database keeps it (spec.form). */
export function formFromRow(v: unknown): FormField[] {
  if (!Array.isArray(v)) return []
  return v.filter(isObj).flatMap(f => {
    const type = FIELD_TYPES.find(t => t === f.type)
    const label = typeof f.label === 'string' ? f.label : ''
    if (!type || !label) return []
    const cols = Array.isArray(f.cols)
      ? f.cols.filter(isObj).map(c => ({ name: String(c.name ?? ''), type: COL_TYPES.find(t => t === c.type) ?? 'Text' }))
      : undefined
    const rows = Array.isArray(f.rows)
      ? f.rows.filter(Array.isArray).map(r => (cols ?? []).map((_, i) => (typeof r[i] === 'string' ? r[i] : '')))
      : []
    // A workflow template's canvas settings, when it has them (a quick task's fields have none).
    const extras: Partial<FormField> = {}
    if (typeof f.req === 'boolean') extras.req = f.req
    if (typeof f.pic === 'boolean') extras.pic = f.pic
    if (type === 'Date') {
      const cal = calOf(f.cal)
      if (cal) extras.cal = cal
    }
    if ((type === 'Select' || type === 'Multi-select') && Array.isArray(f.opts)) extras.opts = f.opts.filter((o): o is string => typeof o === 'string')
    if ((type === 'Select' || type === 'Multi-select') && typeof f.list === 'string' && f.list) extras.list = f.list
    if (typeof f.section === 'string' && f.section) extras.section = f.section
    return [{ label, type, ...(type === 'Table' ? { cols: cols ?? [], ...(rows.length ? { rows } : {}) } : {}), ...extras }]
  })
}

/** A stage's work as the database keeps it. */
export function workFromRow(v: unknown): StageWork {
  if (!isObj(v)) return EMPTY_WORK
  const links = Array.isArray(v.links)
    ? v.links.filter(isObj).filter(l => typeof l.url === 'string').map(l => ({ url: String(l.url), label: typeof l.label === 'string' ? l.label : '' }))
    : []
  const vals: StageWork['vals'] = {}
  if (isObj(v.vals)) for (const [k, x] of Object.entries(v.vals)) {
    if (typeof x === 'string' || typeof x === 'boolean') vals[k] = x
    // A Multi-select's picks (③d-2).
    else if (Array.isArray(x)) vals[k] = x.filter((o): o is string => typeof o === 'string')
  }
  const files: StageFile[] = Array.isArray(v.files)
    ? v.files.filter(isObj).filter(f => typeof f.path === 'string' && f.path).map(f => ({
        path: String(f.path),
        name: typeof f.name === 'string' && f.name ? f.name : String(f.path).split('/').pop() || 'File',
        size: Math.max(0, Number(f.size) || 0),
        mime: typeof f.mime === 'string' ? f.mime : '',
        field: typeof f.field === 'string' && f.field ? f.field : null,
        by: typeof f.by === 'string' ? f.by : '',
        at: typeof f.at === 'string' && f.at ? f.at : null,
      }))
    : []
  return { notes: typeof v.notes === 'string' ? v.notes : '', links, vals, files }
}

let seq = 0
/** A fresh key for a stage on the form. */
export const stageKey = () => `s${Date.now().toString(36)}${(seq++).toString(36)}`

/** New Project's quick stages to start from (the handoff's quick template): a first draft by whoever starts it (their
 * group, their People title), a redesign they approve, the publishing — the people of the last two picked on the form,
 * and with them their groups. */
export function starterStages(me: { id: string; group: string } | null, approver: string | null): DraftStage[] {
  return [
    { key: stageKey(), name: 'First draft', dept: me?.group ?? '', who: me?.id ?? null, sla: 1, appr: [], back: null,
      form: [{ label: 'Canva template link', type: 'Text' }, { label: 'Draft notes', type: 'Text' }] },
    { key: stageKey(), name: 'Redesign', dept: '', who: null, sla: 1, appr: approver ? [approver] : [], back: 0,
      form: [{ label: 'Final artwork', type: 'File' }] },
    { key: stageKey(), name: 'Publish', dept: '', who: null, sla: 1, appr: [], back: null,
      form: [{ label: 'Post link', type: 'Text' }, { label: 'Posted on', type: 'Date' }] },
  ]
}

/** A stage added at the end: nobody yet — and so no group until its person is picked — a day. */
export function newStage(_after?: DraftStage): DraftStage {
  return { key: stageKey(), name: 'New stage', dept: '', who: null, sla: 1, appr: [], form: [], back: null }
}

/** A stage on a builder: its key on the form and the earlier stage changes go back to. */
interface Placed {
  key: string
  back: number | null
}

/** Moved from one place to another; where changes go back to follows the stages it names. */
export function moveStage<T extends Placed>(stages: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= stages.length) return [...stages]
  const keys = stages.map(s => s.key)
  const arr = [...stages]
  const [x] = arr.splice(from, 1)
  arr.splice(Math.max(0, Math.min(to, arr.length)), 0, x)
  return arr.map((s, i) => {
    if (s.back == null) return s
    const target = arr.findIndex(y => y.key === keys[s.back as number])
    return { ...s, back: target >= 0 && target < i ? target : null }
  })
}

/** One taken out; where changes go back to forgets it. */
export function removeStage<T extends Placed>(stages: readonly T[], at: number): T[] {
  const keys = stages.map(s => s.key)
  const arr = stages.filter((_, i) => i !== at)
  return arr.map((s, i) => {
    if (s.back == null) return s
    const target = arr.findIndex(y => y.key === keys[s.back as number])
    return { ...s, back: target >= 0 && target < i ? target : null }
  })
}

/** What stops the task from being created — the form's footer and hint say it. */
export function stageProblems(stages: readonly DraftStage[]): string[] {
  const out: string[] = []
  if (stages.length === 0) out.push('Add a stage')
  if (stages.some(s => !s.who)) out.push('A stage has no person')
  if (stages.some(s => !s.name.trim())) out.push('A stage has no name')
  const fieldsOk = stages.every(s => {
    const named = s.form.filter(f => f.type !== 'Note').map(f => f.label.trim())
    return s.form.every(f => f.label.trim()) && new Set(named).size === named.length
  })
  if (!fieldsOk) out.push('Each field needs its own name')
  return out
}

/** The stages as mkt_task_create takes them. */
export function stagesPayload(stages: readonly DraftStage[]): Record<string, unknown>[] {
  return stages.map(s => ({
    name: s.name.trim(),
    dept: s.dept,
    who: s.who,
    sla: Math.min(MAX_SLA, Math.max(1, Math.trunc(s.sla))),
    appr: s.appr.slice(0, MAX_APPROVALS),
    form: s.form.map(f => (f.type === 'Table' ? { label: f.label.trim(), type: f.type, cols: f.cols ?? [] } : { label: f.label.trim(), type: f.type })),
    back: s.back,
  }))
}

/** "Wei Lun · GRAPHIC DESIGNER · 2 active" — whom the stage's person picker offers: their People title (2026-10-24, the
 * user: it follows People), with how much is on their plate. */
export function personHint(p: MktPerson, load: number): string {
  return [p.role || groupOf(p.title), `${load} active`].filter(Boolean).join(' · ')
}

/** "Due Tue 27 Oct" for a stage on the form. */
export const dueText = (d: string) => longDay(d)

/** Somebody a builder's picker offers: who, their group (People title), what is on their plate. */
export interface PickPerson {
  id: string
  first: string
  hint: string
  group: string
}

/** Whom New Project's pickers offer: Marketing's roster (the viewer first, then by group A → Z, the managers last), each
 * with what is on their plate now — and, for the approval levels, its managers (the user: only MM and AMM approve). */
export function builderPeople(board: MktBoard): { people: PickPerson[]; approvers: PickPerson[] } {
  const load = new Map<string, number>()
  const open = new Set(board.projects.filter(runsStages).map(p => p.id))
  const curOf = new Map(board.projects.map(p => [p.id, p.cur]))
  for (const s of board.stages) {
    if (!open.has(s.project) || curOf.get(s.project) !== s.idx) continue
    const a = approverNow(s)
    const who = a ? (a.kind === 'person' ? a.staff : null) : s.status === 'todo' || s.status === 'accepted' || s.status === 'changes' ? s.owner : null
    if (who) load.set(who, (load.get(who) ?? 0) + 1)
  }
  const rank = (p: MktPerson) => (p.id === board.me ? 0 : isManagerTitle(p.title) ? 2 : 1)
  const people = [...board.team]
    .sort((a, b) => rank(a) - rank(b) || groupOf(a.title).localeCompare(groupOf(b.title)) || a.first.localeCompare(b.first))
    .map(p => ({ id: p.id, first: p.first || p.full, hint: personHint(p, load.get(p.id) ?? 0), group: groupOf(p.title) }))
  return { people, approvers: people.filter(p => isManagerTitle(p.group)) }
}
