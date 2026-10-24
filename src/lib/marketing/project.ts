// A 📦 product project before its work starts (mig 20261024002000, `New Project.dc.html`'s product branch): the project
// on the product's version in effect, its intake meeting minutes as written with the PIC (each kind of answer, who
// attended and signed), what is still missing before they go to the PIC, the step it stands at (Subsidiary & product ·
// Meeting minutes · Tracking link · PIC response), and only what changed, for the save. Pure.

import {
  campaignFromRow, daysBetween, longDay, periodOf, periodWords, personFromRow, shortDay, subFromRow, type MktCampaign, type MktPerson, type MktProjectStatus,
  type MktStageStatus, type MktSub,
} from './board'
import { minutesFieldFromRow, rulesFromRow, type MinutesField, type MinutesRules } from './minutes'
import { delivFromRow, ordinal, picOkFromRow, runMadeText, trailTime, type PicOk, type TaskDeliv, type Tone } from './task'
import { monthLabel, projectBillFromRow, shiftMonth, type ProjectBill } from './billing'

/** A product project's way to its work. */
export type ProductStatus = 'minutes' | 'waiting_pic' | 'changes' | 'approved' | 'active' | 'paused' | 'done' | 'cancelled'
const STATUSES: readonly ProductStatus[] = ['minutes', 'waiting_pic', 'changes', 'approved', 'active', 'paused', 'done', 'cancelled']

/** What a field holds: text (a date, a number as written), people (ids), a table's rows, the Free space's columns and rows,
 * a campaign's run period. */
export type MinutesValue = string | string[] | { rows: string[][]; cols?: string[] } | MinutesPeriod

/** A *Campaign period* as written (the user's answer 13): its two days, '' while one is not picked yet. */
export interface MinutesPeriod {
  from: string
  to: string
}

export const isPeriod = (v: MinutesValue | undefined | null): v is MinutesPeriod => !!v && typeof v === 'object' && !Array.isArray(v) && 'from' in v

export interface MinutesDoc {
  id: string
  title: string
  intake: boolean
  status: 'draft' | 'sent' | 'completed'
  locked: boolean
  rev: number
  vals: Record<string, MinutesValue>
  /** Who signed: staff id → when. */
  signed: Record<string, string>
  notes: string
  completedAt: string | null
  completedBy: string | null
  updatedBy: string | null
  template: { id: string; version: number; name: string; fields: MinutesField[]; rules: MinutesRules }
}

export interface PicReply {
  decision: 'approved' | 'changes'
  name: string
  reason: string
  at: string | null
  /** Which PIC answered (mig 20261025034000) — the first when the reply is older than two PICs. */
  pic: 1 | 2
}

export interface ProductProjectPage {
  today: string
  me: string | null
  team: MktPerson[]
  sub: MktSub | null
  project: {
    id: string
    track: string
    title: string
    status: ProductStatus
    owner: string | null
    ownerName: string | null
    pic: string
    whatsapp: string
    /** The second PIC and theirs (the user's answer 29: one or two), '' for none. */
    pic2: string
    whatsapp2: string
    /** The tracking link's code (made when the minutes are sent) — the first PIC's. */
    link: string | null
    /** The second PIC's own link: made with the minutes sent, or once they are named after. */
    link2: string | null
    /** Whose approvals the minutes have while they wait for both PICs (mig 20261025035000). */
    picOk: PicOk | null
    linkSentAt: string | null
    picReply: PicReply | null
    override: { by: string; at: string | null; reason: string } | null
    createdAt: string | null
    product: { id: string; version: number; name: string; kind: 'one' | 'recurring'; note: string } | null
    /** A recurring one's months, once its work started (②b-2f). */
    runs: ProductRuns | null
    /** A campaign's run period (the user's answer 13), from its intake minutes. */
    campaign: MktCampaign | null
  }
  minutes: MinutesDoc[]
  trail: { at: string; actor: string; action: string; reason: string; data: Record<string, unknown> | null }[]
  /** Its deliverables, once the work started (②b-2a). */
  deliverables: ProductDeliverable[]
  /** Its billing — the amount, a recurring one's months, what was confirmed (②b-2b): the manager's, null for anybody else. */
  bill: ProjectBill | null
}

/** A recurring product project's months (②b-2f — the user's answer 12): made each month on its run day, from its first
 * month ('YYYY-MM-01'), so many made so far, to the month it was stopped. */
export interface ProductRuns {
  day: number
  first: string
  made: number
  until: string | null
}

/** A deliverable as its product's page lists it: where it stands, its stage now and whose. */
export interface ProductDeliverable {
  id: string
  trackId: string
  title: string
  status: MktProjectStatus
  cur: number
  deliv: TaskDeliv | null
  workflow: string | null
  startsOn: string | null
  dueOn: string | null
  doneAt: string | null
  stages: number
  done: number
  stage: { idx: number; name: string; status: MktStageStatus; owner: string | null; dueOn: string | null } | null
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null)
const rows = (v: unknown) => (Array.isArray(v) ? v.filter(isObj) : [])
const strRows = (v: unknown): string[][] => (Array.isArray(v) ? v.filter(Array.isArray).map(r => r.map(c => (typeof c === 'string' ? c : ''))) : [])

function valueFromRow(v: unknown): MinutesValue | null {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  if (isObj(v) && ('from' in v || 'to' in v) && !('rows' in v)) return { from: str(v.from), to: str(v.to) }
  if (isObj(v)) return { rows: strRows(v.rows), ...(Array.isArray(v.cols) ? { cols: v.cols.map(c => (typeof c === 'string' ? c : '')) } : {}) }
  return null
}

function minutesFromRow(m: Record<string, unknown>): MinutesDoc {
  const t = isObj(m.template) ? m.template : {}
  const vals: Record<string, MinutesValue> = {}
  if (isObj(m.vals)) for (const [k, x] of Object.entries(m.vals)) {
    const v = valueFromRow(x)
    if (v !== null) vals[k] = v
  }
  const signed: Record<string, string> = {}
  if (isObj(m.signed)) for (const [k, x] of Object.entries(m.signed)) signed[k] = isObj(x) ? str(x.at) : ''
  return {
    id: str(m.id),
    title: str(m.title),
    intake: m.intake === true,
    status: m.status === 'sent' || m.status === 'completed' ? m.status : 'draft',
    locked: m.locked === true,
    rev: typeof m.rev === 'number' ? m.rev : 1,
    vals,
    signed,
    notes: str(m.notes),
    completedAt: strOrNull(m.completedAt),
    completedBy: strOrNull(m.completedBy),
    updatedBy: strOrNull(m.updatedBy),
    template: {
      id: str(t.id),
      version: typeof t.version === 'number' ? t.version : 1,
      name: str(t.name),
      fields: (Array.isArray(t.fields) ? t.fields : []).map(minutesFieldFromRow).filter((f): f is MinutesField => !!f),
      rules: rulesFromRow(t.rules),
    },
  }
}

function runsFromRow(v: unknown): ProductRuns | null {
  if (!isObj(v)) return null
  const day = Number(v.day), made = Number(v.made)
  const first = typeof v.first === 'string' && /^\d{4}-\d{2}-01/.test(v.first) ? v.first.slice(0, 10) : null
  if (!first || !Number.isInteger(day) || day < 1 || day > 28) return null
  const until = typeof v.until === 'string' && /^\d{4}-\d{2}-01/.test(v.until) ? v.until.slice(0, 10) : null
  return { day, first, made: Number.isInteger(made) && made >= 1 ? made : 1, until }
}

/** Run k's month ('YYYY-MM-01'). */
export const runMonth = (r: ProductRuns, k: number) => shiftMonth(r.first, k - 1)

/** The next month's run day ('YYYY-MM-DD'), or null once the month it was stopped is made. */
export function nextRun(r: ProductRuns): string | null {
  const month = runMonth(r, r.made + 1)
  if (r.until && month > r.until) return null
  return `${month.slice(0, 8)}${String(r.day).padStart(2, '0')}`
}

/** Its months in a line: "Every month on the 5th · next 5 Nov 2026" — "Every month on the 5th · ended Dec 2026". */
/** Where a campaign stands today (the user's answer 13): before its run — "Runs 9 – 12 Nov 2026 · in 16 days"; running —
 * "Live · 9 – 12 Nov 2026 · ends 12 Nov"; after — "Ran 9 – 12 Nov 2026". */
export function campaignLine(c: MktCampaign, today: string): { text: string; live: boolean } {
  const words = periodWords(c.from, c.until)
  if (today && today < c.from) {
    const n = daysBetween(today, c.from)
    return { text: `Runs ${words} · ${n === 1 ? 'tomorrow' : `in ${n} days`}`, live: false }
  }
  if (today && today <= c.until) return { text: `Live · ${words}${c.until === today ? ' · ends today' : ` · ends ${shortDay(c.until)}`}`, live: true }
  return { text: `${today ? 'Ran' : 'Runs'} ${words}`, live: false }
}

/** The intake's *Campaign period* as written (④-2b): its run once both days are in, the end on or after the start — null
 * while not; undefined when its template has none (the project's run is then as saved). */
export function typedCampaign(fields: readonly MinutesField[], vals: Readonly<Record<string, MinutesValue>>): MktCampaign | null | undefined {
  const f = fields.find(x => x.type === 'Campaign period')
  if (!f) return undefined
  const v = vals[f.name]
  return isPeriod(v) && v.from && v.to && v.to >= v.from ? { from: v.from, until: v.to } : null
}

export function runsLine(r: ProductRuns): string {
  const next = nextRun(r)
  const [y, m, d] = (next ?? '').split('-')
  return `Every month on the ${ordinal(r.day)} · ${next ? `next ${+d} ${monthLabel(`${y}-${m}-01`).split(' ')[0]} ${y}` : `ended ${monthLabel(r.until ?? r.first)}`}`
}

/** A recurring project's deliverables by month, the latest first — each month by category as deliverableGroups. */
export function deliverableRuns(list: readonly ProductDeliverable[], r: ProductRuns): { run: number; month: string; list: ProductDeliverable[] }[] {
  const runs = new Map<number, ProductDeliverable[]>()
  for (const d of list) {
    const k = d.deliv?.run ?? 1
    runs.set(k, [...(runs.get(k) ?? []), d])
  }
  return [...runs.entries()].sort((a, b) => b[0] - a[0]).map(([run, rows]) => ({ run, month: monthLabel(runMonth(r, run)), list: rows }))
}

/** mkt_product_project(key): the page, or null (no such product project). */
export function productProjectFromRow(v: unknown): ProductProjectPage | null {
  if (!isObj(v) || !isObj(v.project)) return null
  const p = v.project
  if (!str(p.id)) return null
  const reply = isObj(p.picReply) ? p.picReply : null
  const override = isObj(p.override) ? p.override : null
  const product = isObj(p.product) ? p.product : null
  return {
    today: str(v.today),
    me: strOrNull(v.me),
    team: rows(v.team).map(personFromRow),
    sub: isObj(v.sub) ? subFromRow(v.sub) : null,
    project: {
      id: str(p.id),
      track: str(p.track),
      title: str(p.title),
      status: STATUSES.find(s => s === p.status) ?? 'minutes',
      owner: strOrNull(p.owner),
      ownerName: strOrNull(p.ownerName),
      pic: str(p.pic),
      whatsapp: str(p.whatsapp),
      pic2: str(p.pic2),
      whatsapp2: str(p.whatsapp2),
      link: strOrNull(p.link),
      link2: strOrNull(p.link2),
      picOk: picOkFromRow(p.picOk),
      linkSentAt: strOrNull(p.linkSentAt),
      picReply: reply
        ? { decision: reply.decision === 'approved' ? 'approved' : 'changes', name: str(reply.name), reason: str(reply.reason), at: strOrNull(reply.at),
            pic: reply.pic === 2 ? 2 : 1 }
        : null,
      override: override ? { by: str(override.by), at: strOrNull(override.at), reason: str(override.reason) } : null,
      createdAt: strOrNull(p.createdAt),
      product: product
        ? { id: str(product.id), version: typeof product.version === 'number' ? product.version : 1, name: str(product.name),
            kind: product.kind === 'recurring' ? 'recurring' : 'one', note: str(product.note) }
        : null,
      runs: runsFromRow(p.runs),
      campaign: campaignFromRow(p.campaign),
    },
    minutes: rows(v.minutes).map(minutesFromRow),
    trail: rows(v.trail).map(e => ({ at: str(e.at), actor: str(e.actor), action: str(e.action), reason: str(e.reason), data: isObj(e.data) ? e.data : null })),
    deliverables: rows(v.deliverables).map(deliverableFromRow),
    bill: projectBillFromRow(v.bill),
  }
}

const D_STATUSES: readonly MktProjectStatus[] = ['planning', 'active', 'paused', 'done', 'cancelled']
const S_STATUSES: readonly MktStageStatus[] = ['planned', 'todo', 'accepted', 'review', 'changes', 'done']
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)

function deliverableFromRow(d: Record<string, unknown>): ProductDeliverable {
  const s = isObj(d.stage) ? d.stage : null
  return {
    id: str(d.id),
    trackId: str(d.trackId),
    title: str(d.title),
    status: D_STATUSES.find(x => x === d.status) ?? 'planning',
    cur: count(d.cur),
    deliv: delivFromRow(d.deliv),
    workflow: strOrNull(d.workflow),
    startsOn: strOrNull(d.startsOn),
    dueOn: strOrNull(d.dueOn),
    doneAt: strOrNull(d.doneAt),
    stages: count(d.stages),
    done: count(d.done),
    stage: s
      ? { idx: count(s.idx), name: str(s.name), status: S_STATUSES.find(x => x === s.status) ?? 'planned', owner: strOrNull(s.owner), dueOn: strOrNull(s.dueOn) }
      : null,
  }
}

/** The work may start: the PIC approved the minutes (or it was started before approval) and nothing is made yet. */
export function canBeginWork(page: Pick<ProductProjectPage, 'project' | 'deliverables'>): boolean {
  const { status, override } = page.project
  return !page.deliverables.length && (status === 'approved' || (!!override && (status === 'waiting_pic' || status === 'changes')))
}

/** Deliverables done ÷ all (the user's answer 17) — a cancelled one counts in neither. */
export function deliverableProgress(list: readonly ProductDeliverable[]): { done: number; all: number } {
  const live = list.filter(d => d.status !== 'cancelled')
  return { done: live.filter(d => d.status === 'done').length, all: live.length }
}

/** Where a deliverable stands, in the list's words and tone. */
export function deliverableState(d: ProductDeliverable, team: readonly MktPerson[], today: string): { label: string; tone: Tone } {
  if (d.status === 'planning') return { label: 'Not planned', tone: 'draft' }
  if (d.status === 'done') return { label: 'Done', tone: 'done' }
  if (d.status === 'cancelled') return { label: 'Cancelled', tone: 'draft' }
  if (d.status === 'paused') return { label: 'Paused', tone: 'draft' }
  if (d.startsOn && today && d.startsOn > today) return { label: `Starts ${longDay(d.startsOn)}`, tone: 'draft' }
  const s = d.stage
  if (!s) return { label: 'In progress', tone: 'waiting' }
  const who = s.owner ? team.find(p => p.id === s.owner)?.first || 'someone' : 'Picked by the stage before'
  const late = !!s.dueOn && !!today && s.dueOn < today
  return { label: `Stage ${s.idx + 1} of ${d.stages} · ${s.name} · ${who}`, tone: late ? 'red' : 'waiting' }
}

/** The list in the product's order: each category, its actions, their deliverables. */
export function deliverableGroups(list: readonly ProductDeliverable[]): { group: string; items: { item: string; rows: ProductDeliverable[] }[] }[] {
  const out: { group: string; items: { item: string; rows: ProductDeliverable[] }[] }[] = []
  for (const d of list) {
    const group = d.deliv?.group ?? ''
    const item = d.deliv?.item ?? d.title
    let g = out.find(x => x.group === group)
    if (!g) out.push((g = { group, items: [] }))
    let it = g.items.find(x => x.item === item)
    if (!it) g.items.push((it = { item, rows: [] }))
    it.rows.push(d)
  }
  return out
}

/** A product on sale, as New Project offers it (mkt_product_picker). */
export interface ProductPick {
  id: string
  code: string
  name: string
  kind: 'one' | 'recurring'
  version: number
  /** What it includes, in words ("4 image posts + 2 videos / month"). */
  note: string
  description: string
  actions: number
  intake: { id: string; name: string; version: number; fields: number }
  /** Its list price — offered as the project's amount (②b-2b): a one-time project's whole, a recurring one's a month. */
  price: number | null
}

export function productPicksFromRow(v: unknown): ProductPick[] {
  return rows(v).map(p => {
    const i = isObj(p.intake) ? p.intake : {}
    return {
      id: str(p.id),
      code: str(p.code),
      name: str(p.name),
      kind: p.kind === 'recurring' ? 'recurring' : 'one',
      version: typeof p.version === 'number' ? p.version : 1,
      note: str(p.note),
      description: str(p.description),
      actions: typeof p.actions === 'number' ? p.actions : 0,
      intake: { id: str(i.id), name: str(i.name), version: typeof i.version === 'number' ? i.version : 1, fields: typeof i.fields === 'number' ? i.fields : 0 },
      price: typeof p.price === 'number' ? p.price : typeof p.price === 'string' && Number.isFinite(Number(p.price)) ? Number(p.price) : null,
    }
  })
}

// ── Reckoned from the minutes ───────────────────────────────────────────────────

const blank = (v: MinutesValue | undefined) =>
  v === undefined ? true : typeof v === 'string' ? !v.trim() : Array.isArray(v) ? v.length === 0 : isPeriod(v) ? !v.from || !v.to : !v.rows.some(r => r.some(c => c.trim()))

/** The required fields still empty (as mkt_minutes_missing says) — the project link fills itself, signatures are their own. */
export function minutesMissing(fields: readonly MinutesField[], vals: Readonly<Record<string, MinutesValue>>): string[] {
  return fields.filter(f => (f.req || f.lock) && f.type !== 'Project link' && f.type !== 'Signature' && blank(vals[f.name])).map(f => f.name)
}

/** Who attended: the locked People field. */
export function attendeesOf(fields: readonly MinutesField[], vals: Readonly<Record<string, MinutesValue>>): string[] {
  const f = fields.find(x => x.type === 'People' && x.lock)
  const v = f ? vals[f.name] : undefined
  return Array.isArray(v) ? v : []
}

/** Attendees yet to sign, when the template asks every attendee to. */
export function unsignedOf(doc: Pick<MinutesDoc, 'template' | 'vals' | 'signed'>): string[] {
  if (!doc.template.rules.sign || !doc.template.fields.some(f => f.type === 'Signature')) return []
  return attendeesOf(doc.template.fields, doc.vals).filter(a => !doc.signed[a])
}

/** The PIC is reached on WhatsApp when they approve on the link (mkt_minutes_send asks the same 8 digits). */
export const whatsappOk = (number: string) => number.replace(/\D/g, '').length >= 8

/** The PICs as the minutes name them: the first, and a second when named (the user's answer 29). */
export type MinutesPics = { name: string; whatsapp: string; name2?: string; whatsapp2?: string }

/** What stops the intake minutes going to the PIC, in the order the side card says it — a second PIC named is reached
 * on WhatsApp too (mkt_minutes_send asks it). */
export function sendProblems(doc: MinutesDoc, pic: MinutesPics, team: readonly MktPerson[]): string[] {
  const out = minutesMissing(doc.template.fields, doc.vals).map(n => `${n} is empty`)
  if (!pic.name.trim()) out.push('Name the PIC')
  if (doc.template.rules.pic && !whatsappOk(pic.whatsapp)) out.push('Add the PIC’s WhatsApp')
  if (doc.template.rules.pic && pic.name2?.trim() && !whatsappOk(pic.whatsapp2 ?? '')) out.push('Add the second PIC’s WhatsApp')
  const nameOf = (id: string) => team.find(p => p.id === id)?.first ?? 'Somebody'
  const unsigned = unsignedOf(doc)
  if (unsigned.length) out.push(`Waiting for ${unsigned.map(nameOf).join(', ')} to sign`)
  return out
}

/** The side card's count: the required fields filled, of all of them — with the PIC's name, and their WhatsApp when
 * the link goes to them. */
export function requiredTally(doc: Pick<MinutesDoc, 'template'>, vals: Readonly<Record<string, MinutesValue>>, pic: MinutesPics): { done: number; total: number } {
  const fields = doc.template.fields.filter(f => (f.req || f.lock) && f.type !== 'Project link' && f.type !== 'Signature')
  const own = [!!pic.name.trim(), ...(doc.template.rules.pic ? [whatsappOk(pic.whatsapp)] : []),
    ...(doc.template.rules.pic && pic.name2?.trim() ? [whatsappOk(pic.whatsapp2 ?? '')] : [])]
  return { done: fields.length - minutesMissing(doc.template.fields, vals).length + own.filter(Boolean).length, total: fields.length + own.length }
}

/** The stepper (Subsidiary & product · Meeting minutes · Tracking link · PIC response): the PIC's step only when the
 * minutes go to them; approved without them, every step is done. */
export function stepsOf(status: ProductStatus, pic: boolean): { label: string; state: 'done' | 'current' | 'todo' }[] {
  const labels = ['Subsidiary & product', 'Meeting minutes', 'Tracking link', ...(pic ? ['PIC response'] : [])]
  // Once the work has started, every step is behind it.
  const cur = status === 'active' || status === 'done' ? labels.length + 1
    : status === 'minutes' ? 2 : status === 'waiting_pic' ? 3 : pic ? 4 : labels.length + 1
  return labels.map((label, i) => ({ label, state: i + 1 < cur ? 'done' : i + 1 === cur ? 'current' : 'todo' }))
}

/** Back with the PIC because something they see changed after they approved: what changed, else null. */
export function editedAfterApproval(page: Pick<ProductProjectPage, 'project' | 'trail'>): string | null {
  if (page.project.status !== 'waiting_pic') return null
  const last = page.trail.find(e => e.action === 'link sent' || e.action === 'resent' || e.action === 'edited after approval')
  return last?.action === 'edited after approval' ? last.reason || 'The minutes' : null
}

export interface MinutesEdit {
  vals: Record<string, MinutesValue>
  notes: string
  pic: string
  whatsapp: string
  pic2: string
  whatsapp2: string
}

const same = (a: MinutesValue | undefined, b: MinutesValue | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Only what changed, as mkt_minutes_fill takes it (a field emptied: null); null when nothing did. */
export function fillPatch(saved: MinutesEdit, now: MinutesEdit, intake: boolean): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {}
  const vals: Record<string, MinutesValue | null> = {}
  for (const k of new Set([...Object.keys(saved.vals), ...Object.keys(now.vals)])) {
    if (same(saved.vals[k], now.vals[k])) continue
    const v = now.vals[k]
    vals[k] = v === undefined || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0) || (isPeriod(v) && !v.from && !v.to) ? null : v
  }
  if (Object.keys(vals).length) patch.vals = vals
  if (now.notes !== saved.notes) patch.notes = now.notes
  if (intake && now.pic !== saved.pic) patch.pic = now.pic
  if (intake && now.whatsapp !== saved.whatsapp) patch.whatsapp = now.whatsapp
  if (intake && now.pic2 !== saved.pic2) patch.pic2 = now.pic2
  if (intake && now.whatsapp2 !== saved.whatsapp2) patch.whatsapp2 = now.whatsapp2
  return Object.keys(patch).length ? patch : null
}

/** The PIC's link, as the page shows and copies it. */
export const linkUrl = (origin: string, code: string) => `${origin.replace(/\/$/, '')}/t/${code}`

/** WhatsApp, with the link in the message (the number's digits only). */
export function whatsappUrl(number: string, text: string): string | null {
  return whatsappOk(number) ? `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(text)}` : null
}

/** Where a product project stands, in the side card's words and tone. */
export function productStatus(status: ProductStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'minutes': return { label: 'Draft', tone: 'draft' }
    case 'waiting_pic': return { label: 'Waiting for PIC', tone: 'waiting' }
    case 'changes': return { label: 'Changes requested', tone: 'red' }
    case 'approved': return { label: 'Approved', tone: 'done' }
    case 'active': return { label: 'In progress', tone: 'waiting' }
    case 'paused': return { label: 'Paused', tone: 'draft' }
    case 'done': return { label: 'Done', tone: 'done' }
    case 'cancelled': return { label: 'Cancelled', tone: 'draft' }
  }
}

/** One line of a product project's trail in the store's words (mkt_log's actions on a product project). */
/** '2026-10' (a trail line's month) → 'Oct 2026'. */
const billMonth = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}$/.test(v) ? monthLabel(`${v}-01`) : 'a month')

export function productEventText(e: { actor: string; action: string; reason: string | null; data?: Record<string, unknown> | null }, product: { name: string; version: number } | null): string {
  const who = e.actor || 'Somebody'
  const n = Number(e.data?.deliverables) || 0
  return e.action === 'created' ? `${who} started the project${product ? ` · ${product.name} v${product.version}` : ''}`
    : e.action === 'work started' ? `${who} started the work · ${n} deliverable${n === 1 ? '' : 's'}${Number(e.data?.runDay) ? ` · every month on the ${ordinal(Number(e.data?.runDay))}` : ''}`
    // A recurring one's months (②b-2f).
    : e.action === 'run made' ? runMadeText(e.data)
    : e.action === 'run day' ? `${who} moved the monthly run to the ${ordinal(Number(e.data?.to) || 1)}`
    : e.action === 'closed' ? 'Every deliverable done · project closed'
    : e.action === 'signed' ? `${who} signed ${e.reason || 'the minutes'}`
    : e.action === 'link sent' ? `${who} sent the tracking link to ${e.reason || 'the PIC'}`
    : e.action === 'minutes completed' ? `${who} completed ${e.reason || 'the minutes'}`
    : e.action === 'edited after approval' ? `${who} changed ${e.reason || 'the minutes'} after approval · back to the PIC`
    : e.action === 'started before approval' ? `${who} started before PIC approval: "${e.reason ?? ''}"`
    : e.action === 'resent' ? `${who} resent to ${e.reason || 'the PIC'}`
    // The first of two when both PICs sign off (②b-2d-2b) names whom the minutes still wait for.
    : e.action === 'pic approved' ? `${who} approved ${e.reason || 'the minutes'} on the link${typeof e.data?.waiting === 'string' && e.data.waiting ? ` · waiting for ${e.data.waiting}` : ''}`
    : e.action === 'pic changes' ? `${who} asked for changes on the link: "${e.reason ?? ''}"`
    // Replace Person (④-5): the project's owner — the swap kept in the line's data.
    // Billing (②b-2b): never its figure — amounts are the manager's, the trail everybody's.
    : e.action === 'amount set' ? `${who} set the amount`
    : e.action === 'billing confirmed' ? `${who} confirmed the billing for ${billMonth(e.data?.month)}`
    : e.action === 'billing withdrawn' ? `${who} withdrew the billing for ${billMonth(e.data?.month)}`
    : e.action === 'stopped' ? `${who} stopped the project · billed to ${billMonth(e.data?.until)}`
    : e.action === 'replaced' ? `${who} replaced ${typeof e.data?.swap === 'string' ? e.data.swap : 'a person'} as the owner${e.reason ? ` · "${e.reason}"` : ''}`
    // A campaign's run period (④-2b — the user's answer 13), as the intake minutes set it.
    : e.action === 'campaign period' ? (periodOf(e.data) ? `${who} set the campaign period · ${periodOf(e.data)}` : `${who} took the campaign period off`)
    : `${who} · ${e.action}${e.reason ? `: ${e.reason}` : ''}`
}

/** The trail newest first, in the store's words. */
export function productTrail(page: Pick<ProductProjectPage, 'project' | 'trail'>): { key: string; t: string; text: string }[] {
  return page.trail.map((e, i) => ({ key: `${e.at}:${i}`, t: trailTime(e.at), text: productEventText(e, page.project.product) }))
}

/** While the minutes wait for both PICs (the template's *Both PICs sign off*, two PICs on the project — ②b-2d-2b): whose
 * approval is in and whom they wait for; null when nobody's is in yet, or either PIC's counts. */
export function bothWaiting(page: Pick<ProductProjectPage, 'project' | 'minutes'>): string | null {
  const pr = page.project
  const doc = page.minutes.find(m => m.intake) ?? page.minutes[0]
  if (pr.status !== 'waiting_pic' || !doc?.template.rules.picAll || !pr.pic2 || !pr.picOk) return null
  const one = pr.picOk['1'], two = pr.picOk['2']
  if (one && !two) return `${one.name || pr.pic} approved · waiting for ${pr.pic2}`
  if (two && !one) return `${two.name || pr.pic2} approved · waiting for ${pr.pic || 'the PIC'}`
  return null
}
