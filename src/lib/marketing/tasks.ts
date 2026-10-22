// A quick or recurring task's stages (mig 20261023234000): New Project's quick Workflow Builder — each stage's name,
// team, person, working days, approval levels, where changes go back to and the fields it fills in — the dates they
// make, what a stage still needs before it is handed on, and the stages as mkt_task_create takes them. The dates and
// the needs are reckoned exactly as the database reckons them (mkt_stage_dates, mkt_stage_missing). Pure.

import { addDays, approverNow, longDay, runsStages, weekdayOf, type MktBoard, type MktDept, type MktPerson } from './board'

export const FIELD_TYPES = ['Text', 'Number', 'Select', 'Multi-select', 'Date', 'Person', 'File', 'Checkbox', 'Table', 'Note'] as const
export type FieldType = (typeof FIELD_TYPES)[number]
export const COL_TYPES = ['Text', 'Number', 'Checkbox', 'Date', 'Person'] as const
export type ColType = (typeof COL_TYPES)[number]
export const FIELD_GLYPH: Record<FieldType, string> = {
  Table: '▤', Note: '✎', Text: 'Aa', Select: '◉', 'Multi-select': '☰', Date: '▦', Person: '◎', File: '⎘', Checkbox: '☑', Number: '#',
}

export const DEPT_LABEL: Record<MktDept, string> = { content: 'Content', social: 'Social Media', design: 'Design', ads: 'Ads', brand: 'Brand' }
export const DEPTS: readonly MktDept[] = ['content', 'social', 'design', 'ads', 'brand']

/** New Project's Type: what kind of work the task is. */
export type TaskType = MktDept | 'other'
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
}

/** A date's mark on the calendar: its name there, its colour (a team's), and whether the PIC's calendar shows it. */
export interface FieldCal {
  label: string
  tone: MktDept
  pic: boolean
}

export interface WorkLink {
  url: string
  label: string
}

/** A stage's work as its owner fills it in. */
export interface StageWork {
  notes: string
  links: WorkLink[]
  vals: Record<string, string | boolean>
}

/** A stage on New Project's form. */
export interface DraftStage {
  key: string
  name: string
  dept: MktDept
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
 * are not asked for; a stage with no field, a note or a link. Empty = ready. */
export function missingWork(form: readonly FormField[], work: StageWork): string[] {
  const inputs = form.filter(f => f.type !== 'Note' && f.type !== 'Table')
  const out = inputs
    .filter(f => {
      const v = work.vals[f.label]
      return v === undefined || v === false || (typeof v === 'string' && !v.trim())
    })
    .map(f => f.label)
  if (inputs.length === 0 && !work.notes.trim() && work.links.length === 0) out.push('a note or a link')
  return out
}

export const EMPTY_WORK: StageWork = { notes: '', links: [], vals: {} }

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
    if (type === 'Date' && isObj(f.cal)) {
      const cal = f.cal
      extras.cal = { label: typeof cal.label === 'string' ? cal.label : '', tone: DEPTS.find(d => d === cal.tone) ?? 'social', pic: cal.pic === true }
    }
    if ((type === 'Select' || type === 'Multi-select') && Array.isArray(f.opts)) extras.opts = f.opts.filter((o): o is string => typeof o === 'string')
    return [{ label, type, ...(type === 'Table' ? { cols: cols ?? [], ...(rows.length ? { rows } : {}) } : {}), ...extras }]
  })
}

/** A stage's work as the database keeps it. */
export function workFromRow(v: unknown): StageWork {
  if (!isObj(v)) return EMPTY_WORK
  const links = Array.isArray(v.links)
    ? v.links.filter(isObj).filter(l => typeof l.url === 'string').map(l => ({ url: String(l.url), label: typeof l.label === 'string' ? l.label : '' }))
    : []
  const vals: Record<string, string | boolean> = {}
  if (isObj(v.vals)) for (const [k, x] of Object.entries(v.vals)) if (typeof x === 'string' || typeof x === 'boolean') vals[k] = x
  return { notes: typeof v.notes === 'string' ? v.notes : '', links, vals }
}

let seq = 0
/** A fresh key for a stage on the form. */
export const stageKey = () => `s${Date.now().toString(36)}${(seq++).toString(36)}`

/** New Project's quick stages to start from (the handoff's quick template): a first draft by whoever starts it, a
 * redesign they approve, the publishing — the people of the last two picked on the form. */
export function starterStages(me: string | null, approver: string | null): DraftStage[] {
  return [
    { key: stageKey(), name: 'First draft', dept: 'social', who: me, sla: 1, appr: [], back: null,
      form: [{ label: 'Canva template link', type: 'Text' }, { label: 'Draft notes', type: 'Text' }] },
    { key: stageKey(), name: 'Redesign', dept: 'design', who: null, sla: 1, appr: approver ? [approver] : [], back: 0,
      form: [{ label: 'Final artwork', type: 'File' }] },
    { key: stageKey(), name: 'Publish', dept: 'social', who: null, sla: 1, appr: [], back: null,
      form: [{ label: 'Post link', type: 'Text' }, { label: 'Posted on', type: 'Date' }] },
  ]
}

/** A stage added at the end: the last one's team, nobody yet, a day. */
export function newStage(after: DraftStage | undefined): DraftStage {
  return { key: stageKey(), name: 'New stage', dept: after?.dept ?? 'content', who: null, sla: 1, appr: [], form: [], back: null }
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

/** "Wei Lun · Ads · 2 active" — whom the stage's person picker offers, with how much is on their plate. */
export function personHint(p: MktPerson, load: number): string {
  return [p.role || (p.team ? (p.team === 'manager' ? 'Manager' : DEPT_LABEL[p.team]) : p.title), `${load} active`].filter(Boolean).join(' · ')
}

/** "Due Tue 27 Oct" for a stage on the form. */
export const dueText = (d: string) => longDay(d)

const TEAM_ORDER = ['manager', 'content', 'social', 'design', 'ads', 'brand']

/** Whom New Project's pickers offer: Marketing's roster (the viewer first, then by team), each with what is on their
 * plate now — and, for the approval levels, its managers (the user: MM and AMM hold the manager's tools). */
export function builderPeople(board: MktBoard): { people: { id: string; first: string; hint: string; team: string | null }[]; approvers: { id: string; first: string; hint: string; team: string | null }[] } {
  const load = new Map<string, number>()
  const open = new Set(board.projects.filter(runsStages).map(p => p.id))
  const curOf = new Map(board.projects.map(p => [p.id, p.cur]))
  for (const s of board.stages) {
    if (!open.has(s.project) || curOf.get(s.project) !== s.idx) continue
    const a = approverNow(s)
    const who = a ? (a.kind === 'person' ? a.staff : null) : s.status === 'todo' || s.status === 'accepted' || s.status === 'changes' ? s.owner : null
    if (who) load.set(who, (load.get(who) ?? 0) + 1)
  }
  const rank = (p: MktPerson) => (p.id === board.me ? -1 : TEAM_ORDER.indexOf(p.team ?? '') + 1 || 99)
  const people = [...board.team]
    .sort((a, b) => rank(a) - rank(b) || a.first.localeCompare(b.first))
    .map(p => ({ id: p.id, first: p.first || p.full, hint: personHint(p, load.get(p.id) ?? 0), team: p.team }))
  return { people, approvers: people.filter(p => p.team === 'manager') }
}
