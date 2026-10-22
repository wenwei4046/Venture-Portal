// A 📦 product project before its work starts (mig 20261024002000, `New Project.dc.html`'s product branch): the project
// on the product's version in effect, its intake meeting minutes as written with the PIC (each kind of answer, who
// attended and signed), what is still missing before they go to the PIC, the step it stands at (Subsidiary & product ·
// Meeting minutes · Tracking link · PIC response), and only what changed, for the save. Pure.

import { personFromRow, subFromRow, type MktPerson, type MktSub } from './board'
import { minutesFieldFromRow, rulesFromRow, type MinutesField, type MinutesRules } from './minutes'
import { trailTime, type Tone } from './task'

/** A product project's way to its work. */
export type ProductStatus = 'minutes' | 'waiting_pic' | 'changes' | 'approved' | 'active' | 'paused' | 'done' | 'cancelled'
const STATUSES: readonly ProductStatus[] = ['minutes', 'waiting_pic', 'changes', 'approved', 'active', 'paused', 'done', 'cancelled']

/** What a field holds: text (a date, a number as written), people (ids), a table's rows, the Free space's columns and rows. */
export type MinutesValue = string | string[] | { rows: string[][]; cols?: string[] }

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
    /** The tracking link's code (made when the minutes are sent). */
    link: string | null
    linkSentAt: string | null
    picReply: PicReply | null
    override: { by: string; at: string | null; reason: string } | null
    createdAt: string | null
    product: { id: string; version: number; name: string; kind: 'one' | 'recurring'; note: string } | null
  }
  minutes: MinutesDoc[]
  trail: { at: string; actor: string; action: string; reason: string }[]
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null)
const rows = (v: unknown) => (Array.isArray(v) ? v.filter(isObj) : [])
const strRows = (v: unknown): string[][] => (Array.isArray(v) ? v.filter(Array.isArray).map(r => r.map(c => (typeof c === 'string' ? c : ''))) : [])

function valueFromRow(v: unknown): MinutesValue | null {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
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
      link: strOrNull(p.link),
      linkSentAt: strOrNull(p.linkSentAt),
      picReply: reply ? { decision: reply.decision === 'approved' ? 'approved' : 'changes', name: str(reply.name), reason: str(reply.reason), at: strOrNull(reply.at) } : null,
      override: override ? { by: str(override.by), at: strOrNull(override.at), reason: str(override.reason) } : null,
      createdAt: strOrNull(p.createdAt),
      product: product
        ? { id: str(product.id), version: typeof product.version === 'number' ? product.version : 1, name: str(product.name),
            kind: product.kind === 'recurring' ? 'recurring' : 'one', note: str(product.note) }
        : null,
    },
    minutes: rows(v.minutes).map(minutesFromRow),
    trail: rows(v.trail).map(e => ({ at: str(e.at), actor: str(e.actor), action: str(e.action), reason: str(e.reason) })),
  }
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
    }
  })
}

// ── Reckoned from the minutes ───────────────────────────────────────────────────

const blank = (v: MinutesValue | undefined) =>
  v === undefined ? true : typeof v === 'string' ? !v.trim() : Array.isArray(v) ? v.length === 0 : !v.rows.some(r => r.some(c => c.trim()))

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

/** What stops the intake minutes going to the PIC, in the order the side card says it. */
export function sendProblems(doc: MinutesDoc, pic: { name: string; whatsapp: string }, team: readonly MktPerson[]): string[] {
  const out = minutesMissing(doc.template.fields, doc.vals).map(n => `${n} is empty`)
  if (!pic.name.trim()) out.push('Name the PIC')
  if (doc.template.rules.pic && !whatsappOk(pic.whatsapp)) out.push('Add the PIC’s WhatsApp')
  const nameOf = (id: string) => team.find(p => p.id === id)?.first ?? 'Somebody'
  const unsigned = unsignedOf(doc)
  if (unsigned.length) out.push(`Waiting for ${unsigned.map(nameOf).join(', ')} to sign`)
  return out
}

/** The side card's count: the required fields filled, of all of them — with the PIC's name, and their WhatsApp when
 * the link goes to them. */
export function requiredTally(doc: Pick<MinutesDoc, 'template'>, vals: Readonly<Record<string, MinutesValue>>, pic: { name: string; whatsapp: string }): { done: number; total: number } {
  const fields = doc.template.fields.filter(f => (f.req || f.lock) && f.type !== 'Project link' && f.type !== 'Signature')
  const own = [!!pic.name.trim(), ...(doc.template.rules.pic ? [whatsappOk(pic.whatsapp)] : [])]
  return { done: fields.length - minutesMissing(doc.template.fields, vals).length + own.filter(Boolean).length, total: fields.length + own.length }
}

/** The stepper (Subsidiary & product · Meeting minutes · Tracking link · PIC response): the PIC's step only when the
 * minutes go to them; approved without them, every step is done. */
export function stepsOf(status: ProductStatus, pic: boolean): { label: string; state: 'done' | 'current' | 'todo' }[] {
  const labels = ['Subsidiary & product', 'Meeting minutes', 'Tracking link', ...(pic ? ['PIC response'] : [])]
  const cur = status === 'minutes' ? 2 : status === 'waiting_pic' ? 3 : pic ? 4 : labels.length + 1
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
}

const same = (a: MinutesValue | undefined, b: MinutesValue | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** Only what changed, as mkt_minutes_fill takes it (a field emptied: null); null when nothing did. */
export function fillPatch(saved: MinutesEdit, now: MinutesEdit, intake: boolean): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {}
  const vals: Record<string, MinutesValue | null> = {}
  for (const k of new Set([...Object.keys(saved.vals), ...Object.keys(now.vals)])) {
    if (same(saved.vals[k], now.vals[k])) continue
    const v = now.vals[k]
    vals[k] = v === undefined || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0) ? null : v
  }
  if (Object.keys(vals).length) patch.vals = vals
  if (now.notes !== saved.notes) patch.notes = now.notes
  if (intake && now.pic !== saved.pic) patch.pic = now.pic
  if (intake && now.whatsapp !== saved.whatsapp) patch.whatsapp = now.whatsapp
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

/** The trail newest first, in the store's words (mkt_log's actions on a product project). */
export function productTrail(page: Pick<ProductProjectPage, 'project' | 'trail'>): { key: string; t: string; text: string }[] {
  const product = page.project.product
  return page.trail.map((e, i) => {
    const who = e.actor || 'Somebody'
    const text = e.action === 'created' ? `${who} started the project${product ? ` · ${product.name} v${product.version}` : ''}`
      : e.action === 'signed' ? `${who} signed ${e.reason || 'the minutes'}`
      : e.action === 'link sent' ? `${who} sent the tracking link to ${e.reason || 'the PIC'}`
      : e.action === 'minutes completed' ? `${who} completed ${e.reason || 'the minutes'}`
      : e.action === 'edited after approval' ? `${who} changed ${e.reason || 'the minutes'} after approval · back to the PIC`
      : e.action === 'started before approval' ? `${who} started before PIC approval: "${e.reason}"`
      : e.action === 'resent' ? `${who} resent to ${e.reason || 'the PIC'}`
      : e.action === 'pic approved' ? `${who} approved ${e.reason || 'the minutes'} on the link`
      : e.action === 'pic changes' ? `${who} asked for changes on the link: "${e.reason}"`
      : `${who} · ${e.action}${e.reason ? `: ${e.reason}` : ''}`
    return { key: `${e.at}:${i}`, t: trailTime(e.at), text }
  })
}
