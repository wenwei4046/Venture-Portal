import { minutesFieldFromRow, rulesFromRow, type MinutesField, type MinutesRules } from './minutes'
import { attendeesOf, isPeriod, minutesMissing, unsignedOf, type MinutesDoc, type MinutesValue } from './project'

// A task written with meeting minutes (②a-3, mig 20261025221000 — 2026-10-25, the user: "规则跟开 quick task 是一样的
// 概念：1. 可以选择不开 meeting minutes，只是写 requirement 2. 或者是选择开 meeting minutes"; answers 54, 55): New
// Project's *Use meeting minutes* picks a published template and fills it in there and then (`New Project.dc.html`: "For
// bigger tasks discussed in a meeting. The minutes become this task's requirements."); a recurring task's on its series.
// The PIC approving them (answers 52, 53) comes with ②a-4.

/** A minutes template New Project offers (mkt_minutes_picker): published, at its last version. */
export interface MinutesPick {
  id: string
  name: string
  version: number
  fields: MinutesField[]
  rules: MinutesRules
}

/** New Project's minutes as typed: the template picked, what is written in it, the meeting notes, and whether whoever starts
 * the task signs there and then. */
export interface NewMinutes {
  template: string
  vals: Record<string, MinutesValue>
  notes: string
  sign: boolean
}

export const NO_MINUTES: NewMinutes = { template: '', vals: {}, notes: '', sign: false }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** mkt_minutes_picker(): the templates published — anything else left out. */
export function minutesPicksFromRow(v: unknown): MinutesPick[] {
  if (!Array.isArray(v)) return []
  return v.filter(isObj).flatMap(t => {
    const id = str(t.id)
    if (!id) return []
    const fields = (Array.isArray(t.fields) ? t.fields : []).map(minutesFieldFromRow).filter((f): f is MinutesField => f !== null)
    return [{ id, name: str(t.name), version: typeof t.version === 'number' ? t.version : 1, fields, rules: rulesFromRow(t.rules) }]
  })
}

/** What a field holds as a draft keeps it — anything else left out. */
function valueOf(v: unknown): MinutesValue | null {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  if (!isObj(v)) return null
  if ('from' in v || 'to' in v) return { from: str(v.from), to: str(v.to) }
  if (!Array.isArray(v.rows)) return null
  const rows = v.rows.filter(Array.isArray).map(r => r.map(c => (typeof c === 'string' ? c : '')))
  return Array.isArray(v.cols) ? { rows, cols: v.cols.map(c => (typeof c === 'string' ? c : '')) } : { rows }
}

/** A draft's minutes put back. */
export function newMinutesFromDraft(v: unknown): NewMinutes {
  if (!isObj(v)) return NO_MINUTES
  const vals: Record<string, MinutesValue> = {}
  if (isObj(v.vals)) for (const [k, x] of Object.entries(v.vals)) {
    const val = valueOf(x)
    if (val !== null) vals[k] = val
  }
  return { template: str(v.template), vals, notes: str(v.notes).slice(0, 4000), sign: v.sign === true }
}

/** Anything written in them — the attendees New Project puts in for whoever starts it are not. */
export function minutesTyped(m: NewMinutes, pick: MinutesPick | null, me: string | null): boolean {
  if (m.notes.trim()) return true
  const auto = pick?.fields.find(f => f.type === 'People' && f.lock)?.name
  return Object.entries(m.vals).some(([k, v]) => {
    if (k === auto && Array.isArray(v) && v.length <= 1 && (v.length === 0 || v[0] === me)) return false
    return typeof v === 'string' ? !!v.trim() : Array.isArray(v) ? v.length > 0 : isPeriod(v) ? !!(v.from || v.to) : v.rows.some(r => r.some(c => c.trim()))
  })
}

/** A template picked: the attendees start as whoever starts the task, when they are on the team and nobody is named yet. */
export function pickMinutes(m: NewMinutes, pick: MinutesPick, me: string | null): NewMinutes {
  const att = pick.fields.find(f => f.type === 'People' && f.lock)
  const vals = { ...m.vals }
  if (att && me && !(Array.isArray(vals[att.name]) && (vals[att.name] as string[]).length)) vals[att.name] = [me]
  return { ...m, template: pick.id, vals }
}

/** The minutes as New Project draws them — the template picked, not made yet (signed by whoever starts it once they say so). */
export function newMinutesDoc(pick: MinutesPick, m: NewMinutes, me: string | null): MinutesDoc {
  const vals = onlyItsFields(pick, m.vals)
  const signs = !!me && m.sign && attendeesOf(pick.fields, vals).includes(me) && pick.fields.some(f => f.type === 'Signature')
  return {
    id: '', title: pick.name, intake: true, status: 'draft', locked: false, rev: 0, vals, signed: signs ? { [me]: 'now' } : {},
    notes: m.notes, completedAt: null, completedBy: null, updatedBy: null,
    template: { id: pick.id, version: pick.version, name: pick.name, fields: pick.fields, rules: pick.rules },
  }
}

/** Only the picked template's own fields — what another one held stays in the form, never sent. */
function onlyItsFields(pick: MinutesPick, vals: Readonly<Record<string, MinutesValue>>): Record<string, MinutesValue> {
  const out: Record<string, MinutesValue> = {}
  for (const f of pick.fields) if (f.name in vals) out[f.name] = vals[f.name]
  return out
}

const blank = (v: MinutesValue) =>
  typeof v === 'string' ? !v.trim() : Array.isArray(v) ? v.length === 0 : isPeriod(v) ? !v.from && !v.to : !v.rows.some(r => r.some(c => c.trim()))

/** What New Project sends (mkt_task_create's p_minutes): the template, its own fields — an empty one left out — the notes,
 * and the signature of whoever starts it. */
export function minutesPayload(pick: MinutesPick, m: NewMinutes): Record<string, unknown> {
  const vals: Record<string, MinutesValue> = {}
  for (const [k, v] of Object.entries(onlyItsFields(pick, m.vals))) {
    const f = pick.fields.find(x => x.name === k)
    if (!f || f.type === 'Project link' || f.type === 'Signature' || blank(v)) continue
    vals[k] = v
  }
  return { template: pick.id, vals, notes: m.notes, sign: m.sign }
}

/** What stops the task being made with them: none picked, or a required field empty (as mkt_task_create says). */
export function minutesProblems(pick: MinutesPick | null, m: NewMinutes): string[] {
  if (!pick) return ['Pick the meeting minutes']
  return minutesMissing(pick.fields, onlyItsFields(pick, m.vals)).map(n => `${n} is empty`)
}

/** A task's minutes as its page says where they stand: complete, or whom they wait for to sign. */
export function minutesState(doc: MinutesDoc, nameOf: (id: string) => string): { label: string; done: boolean } {
  if (doc.status === 'completed') return { label: doc.locked ? 'Complete · locked' : 'Complete', done: true }
  const wait = unsignedOf(doc)
  return wait.length ? { label: `Waiting for ${wait.map(nameOf).join(', ')} to sign`, done: false } : { label: 'Draft', done: false }
}
