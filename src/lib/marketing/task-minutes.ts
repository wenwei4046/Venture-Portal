import type { MktSub } from './board'
import { minutesFieldFromRow, rulesFromRow, type MinutesField, type MinutesRules } from './minutes'
import { attendeesOf, isPeriod, minutesMissing, unsignedOf, whatsappOk, type MinutesDoc, type MinutesValue } from './project'
import type { TaskPicMinutes } from './task'

// A task written with meeting minutes (②a-3, mig 20261025221000 — 2026-10-25, the user: "规则跟开 quick task 是一样的
// 概念：1. 可以选择不开 meeting minutes，只是写 requirement 2. 或者是选择开 meeting minutes"; answers 54, 55): New
// Project's *Use meeting minutes* picks a published template and fills it in there and then (`New Project.dc.html`: "For
// bigger tasks discussed in a meeting. The minutes become this task's requirements."); a recurring task's on its series.
// The PIC approving them (②a-4, mig 20261025231000 — answers 52, 53: "可以选择到底是要给 PIC approve，还是不要给 PIC
// approve"; "要等（同产品项目）"): chosen on New Project, the PIC named there; the work waits for their approval.

/** A minutes template New Project offers (mkt_minutes_picker): published, at its last version. */
export interface MinutesPick {
  id: string
  name: string
  version: number
  fields: MinutesField[]
  rules: MinutesRules
}

/** The PIC approving the minutes (②a-4): asked or not, whom, on what WhatsApp — the link goes to them; a second PIC on their
 * own link. */
export interface NewPic {
  on: boolean
  name: string
  whatsapp: string
  name2: string
  whatsapp2: string
}

export const NO_PIC: NewPic = { on: false, name: '', whatsapp: '', name2: '', whatsapp2: '' }

/** New Project's minutes as typed: the template picked, what is written in it, the meeting notes, whether whoever starts
 * the task signs there and then, and the PIC who approves them (②a-4). */
export interface NewMinutes {
  template: string
  vals: Record<string, MinutesValue>
  notes: string
  sign: boolean
  pic: NewPic
}

export const NO_MINUTES: NewMinutes = { template: '', vals: {}, notes: '', sign: false, pic: NO_PIC }

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
  const p = isObj(v.pic) ? v.pic : {}
  const pic: NewPic = { on: p.on === true, name: str(p.name).slice(0, 80), whatsapp: str(p.whatsapp).slice(0, 40), name2: str(p.name2).slice(0, 80),
    whatsapp2: str(p.whatsapp2).slice(0, 40) }
  return { template: str(v.template), vals, notes: str(v.notes).slice(0, 4000), sign: v.sign === true, pic }
}

type SubPics = Pick<MktSub, 'pic' | 'whatsapp' | 'pic2' | 'whatsapp2'>
const picsOf = (s: SubPics | null) => ({ name: s?.pic ?? '', whatsapp: s?.whatsapp ?? '', name2: s?.pic2 ?? '', whatsapp2: s?.whatsapp2 ?? '' })
const picTyped = (p: NewPic) => !!(p.name.trim() || p.whatsapp.trim() || p.name2.trim() || p.whatsapp2.trim())

/** The PIC asked for (②a-4): named as the subsidiary names its PICs — unless somebody is typed already. */
export function picFor(pic: NewPic, sub: SubPics | null): NewPic {
  return picTyped(pic) ? { ...pic, on: true } : { ...pic, ...picsOf(sub), on: true }
}

/** Another subsidiary picked: its PICs instead — unless the PICs were typed by hand (they differ from the one before's). */
export function picOnSubChange(pic: NewPic, was: SubPics | null, now: SubPics | null): NewPic {
  const before = picsOf(was)
  const same = pic.name === before.name && pic.whatsapp === before.whatsapp && pic.name2 === before.name2 && pic.whatsapp2 === before.whatsapp2
  return same || !picTyped(pic) ? { ...pic, ...picsOf(now) } : pic
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

/** A template picked: the attendees start as whoever starts the task, when they are on the team and nobody is named yet; the
 * PIC approves them as the template's rule says (②a-4) — its own, picked again, as it was — named as the subsidiary names
 * its PICs. */
export function pickMinutes(m: NewMinutes, pick: MinutesPick, me: string | null, sub: SubPics | null = null): NewMinutes {
  const att = pick.fields.find(f => f.type === 'People' && f.lock)
  const vals = { ...m.vals }
  if (att && me && !(Array.isArray(vals[att.name]) && (vals[att.name] as string[]).length)) vals[att.name] = [me]
  const on = m.template === pick.id ? m.pic.on : pick.rules.pic
  return { ...m, template: pick.id, vals, pic: on ? picFor(m.pic, sub) : { ...m.pic, on: false } }
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
 * the signature of whoever starts it, and the PIC who approves them (②a-4) — null when nobody does; a second PIC only
 * when named. */
export function minutesPayload(pick: MinutesPick, m: NewMinutes): Record<string, unknown> {
  const vals: Record<string, MinutesValue> = {}
  for (const [k, v] of Object.entries(onlyItsFields(pick, m.vals))) {
    const f = pick.fields.find(x => x.name === k)
    if (!f || f.type === 'Project link' || f.type === 'Signature' || blank(v)) continue
    vals[k] = v
  }
  const pic = m.pic.on
    ? { name: m.pic.name.trim(), whatsapp: m.pic.whatsapp.trim(), ...(m.pic.name2.trim() ? { name2: m.pic.name2.trim(), whatsapp2: m.pic.whatsapp2.trim() } : {}) }
    : null
  return { template: pick.id, vals, notes: m.notes, sign: m.sign, pic }
}

/** What stops the task being made with them: none picked, a required field empty, the PIC asked but not named or not
 * reachable on WhatsApp (as mkt_task_create says). */
export function minutesProblems(pick: MinutesPick | null, m: NewMinutes): string[] {
  if (!pick) return ['Pick the meeting minutes']
  const out = minutesMissing(pick.fields, onlyItsFields(pick, m.vals)).map(n => `${n} is empty`)
  if (m.pic.on && !m.pic.name.trim()) out.push('Name the PIC')
  if (m.pic.on && !whatsappOk(m.pic.whatsapp)) out.push('Add the PIC’s WhatsApp')
  if (m.pic.on && m.pic.name2.trim() && !whatsappOk(m.pic.whatsapp2)) out.push('Add the second PIC’s WhatsApp')
  return out
}

/** "Kelvin (PIC)"; two — "Kelvin or Hana (PIC)", or "Kelvin and Hana (PIC)" when both sign off. */
export function picWho(pm: Pick<TaskPicMinutes, 'pic' | 'pic2'>, both = false): string {
  const one = pm.pic.trim()
  const two = pm.pic2.trim()
  if (!one || !two) return one || two ? `${one || two} (PIC)` : 'the PIC'
  return `${one} ${both ? 'and' : 'or'} ${two} (PIC)`
}

/** A task's minutes as its page says where they stand: complete, whom they wait for to sign — and, the PIC approving them
 * (②a-4), whom they wait for there, the changes asked, the approval, the work started before it. */
export function minutesState(doc: MinutesDoc, nameOf: (id: string) => string, pm: TaskPicMinutes | null = null): { label: string; done: boolean; red?: boolean } {
  if (pm) {
    const both = !!doc.template.rules.picAll && !!pm.pic2.trim()
    if (pm.reply?.decision === 'approved' && doc.status === 'completed') {
      return { label: `Approved by ${pm.reply.name || 'the PIC'} via link${doc.locked ? ' · locked' : ''}`, done: true }
    }
    if (pm.override && pm.status !== 'minutes' && pm.status !== 'waiting_pic' && pm.status !== 'changes') return { label: 'Started before PIC approval', done: false }
    if (pm.status === 'changes') return { label: `Changes requested by ${pm.reply?.name || pm.pic || 'the PIC'} (PIC)`, done: false, red: true }
    if (pm.status === 'waiting_pic') {
      const one = pm.ok?.['1'], two = pm.ok?.['2']
      if (both && one && !two) return { label: `Waiting for ${pm.pic2} (PIC) · ${one.name || pm.pic} approved`, done: false }
      if (both && two && !one) return { label: `Waiting for ${pm.pic || 'the PIC'} (PIC) · ${two.name || pm.pic2} approved`, done: false }
      return { label: `Waiting for ${picWho(pm, both)}`, done: false }
    }
  }
  if (doc.status === 'completed') return { label: doc.locked ? 'Complete · locked' : 'Complete', done: true }
  const wait = unsignedOf(doc)
  return wait.length ? { label: `Waiting for ${wait.map(nameOf).join(', ')} to sign`, done: false } : { label: pm ? 'Not sent to the PIC yet' : 'Draft', done: false }
}
