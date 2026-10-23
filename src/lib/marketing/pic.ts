// The PIC's link (⑤-1, `PIC Link.dc.html`): what mkt_pic_page answers the stranger holding a product project's code —
// for whom and on what, where it stands, why it waits again, the intake minutes' fields the PIC sees — and, from it,
// the status, the banner, the progress, the card after an answer, and what an answer asks. Pure.

import { officeTime } from '@/lib/office-time'
import { shortDay } from './board'
import type { Tone } from './task'

export type PicStatus = 'waiting_pic' | 'changes' | 'approved' | 'active' | 'paused' | 'done'
const STATUSES: readonly PicStatus[] = ['waiting_pic', 'changes', 'approved', 'active', 'paused', 'done']

/** A field as the PIC reads it: words (a date as written), names, a table's columns and rows; null when empty. */
export type PicValue = string | string[] | { cols: string[]; rows: string[][] } | null

export interface PicField {
  name: string
  type: string
  value: PicValue
}

export interface PicPage {
  today: string
  sub: string
  product: string
  title: string
  track: string
  status: PicStatus
  /** Whose the project is — their first name, for "Reply to … on WhatsApp". */
  owner: string | null
  startedAt: string | null
  sentAt: string | null
  /** The PIC's last answer. */
  reply: { decision: 'approved' | 'changes'; name: string; reason: string; at: string | null } | null
  /** Waiting again because something they see changed after they approved: which fields. */
  updated: { fields: string; at: string | null } | null
  /** Waiting again after the changes they asked for: what they asked. */
  asked: { reason: string; at: string | null } | null
  minutes: { title: string; fields: PicField[] }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null)
const strs = (v: unknown) => (Array.isArray(v) ? v.map(x => (typeof x === 'string' ? x : '')) : [])

/** A link's code: 32 hex (mkt_minutes_send makes it), however it is typed. */
export const isPicCode = (code: string) => /^[0-9a-f]{32}$/i.test(code)

function valueFromRow(type: string, v: unknown): PicValue {
  if (type === 'Table' || type === 'Free space') {
    if (!isObj(v)) return null
    const rows = (Array.isArray(v.rows) ? v.rows : []).filter(Array.isArray).map(strs).filter(r => r.some(c => c.trim()))
    return rows.length ? { cols: strs(v.cols), rows } : null
  }
  if (Array.isArray(v)) {
    const names = strs(v).filter(Boolean)
    return names.length ? names : null
  }
  return typeof v === 'string' && v.trim() ? v : null
}

/** mkt_pic_page(code): the page, or null — the link is closed. */
export function picPageFromRow(v: unknown): PicPage | null {
  if (!isObj(v) || !str(v.track)) return null
  const reply = isObj(v.reply) ? v.reply : null
  const updated = isObj(v.updated) ? v.updated : null
  const asked = isObj(v.asked) ? v.asked : null
  const minutes = isObj(v.minutes) ? v.minutes : {}
  return {
    today: str(v.today),
    sub: str(v.sub),
    product: str(v.product),
    title: str(v.title),
    track: str(v.track),
    status: STATUSES.find(s => s === v.status) ?? 'waiting_pic',
    owner: strOrNull(v.owner),
    startedAt: strOrNull(v.startedAt),
    sentAt: strOrNull(v.sentAt),
    reply: reply ? { decision: reply.decision === 'approved' ? 'approved' : 'changes', name: str(reply.name), reason: str(reply.reason), at: strOrNull(reply.at) } : null,
    updated: updated ? { fields: str(updated.fields), at: strOrNull(updated.at) } : null,
    asked: asked ? { reason: str(asked.reason), at: strOrNull(asked.at) } : null,
    minutes: {
      title: str(minutes.title),
      fields: (Array.isArray(minutes.fields) ? minutes.fields : []).filter(isObj)
        .map(f => ({ name: str(f.name), type: str(f.type), value: valueFromRow(str(f.type), f.value) })),
    },
  }
}

/** "23 Oct", on the office's clock. */
const day = (at: string | null) => (at ? officeTime(at).format('D MMM') : '')
/** "23 Oct 2026, 10:12" — a receipt. */
export const receiptTime = (at: string | null) => (at ? officeTime(at).format('D MMM YYYY, HH:mm') : '')
/** A date field as written ("2026-11-05") in words: "5 Nov 2026". */
export const dateWords = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${shortDay(d)} ${d.slice(0, 4)}` : d)

/** Where it stands, in the PIC's words (the chip). */
export function picStatus(status: PicStatus): { label: string; tone: Tone } {
  switch (status) {
    case 'waiting_pic': return { label: 'Waiting for your approval', tone: 'waiting' }
    case 'changes': return { label: 'Changes requested', tone: 'red' }
    case 'approved': return { label: 'Approved', tone: 'done' }
    case 'active': return { label: 'In progress', tone: 'draft' }
    case 'paused': return { label: 'Paused', tone: 'draft' }
    case 'done': return { label: 'Done', tone: 'done' }
  }
}

/** The banner under the title: why it waits for them, or that nothing does — red, the handoff's *Overdue — please
 * review*, once it has waited 4 working hours (2026-10-24 — the user's answer 2). */
export function picBanner(p: Pick<PicPage, 'status' | 'updated' | 'asked'>, overdue = false): { tone: Tone; title: string; text: string } | null {
  if (p.status === 'waiting_pic') {
    const late = (title: string) => (overdue ? 'Overdue — please review' : title)
    const tone: Tone = overdue ? 'red' : 'waiting'
    if (p.updated) return { tone, title: late('Updated after your approval — please review again'), text: `The team changed ${p.updated.fields || 'the minutes'}.` }
    if (p.asked) return { tone, title: late('Updated — please review again'), text: `You asked: “${p.asked.reason}”` }
    return { tone, title: late('Waiting for your approval'), text: 'The meeting minutes are ready. Please review them below.' }
  }
  if (p.status === 'approved') return { tone: 'done', title: 'Approved', text: 'Thank you. Nothing else needs your action right now.' }
  return null
}

export type PicStep = { label: string; state: 'done' | 'cur' | 'next'; date: string; sub: string }

/** The progress: the meeting, the minutes sent, their approval, the work. */
export function picTimeline(p: Pick<PicPage, 'status' | 'startedAt' | 'sentAt' | 'reply'>): PicStep[] {
  const approved = p.status !== 'waiting_pic' && p.status !== 'changes'
  const yours: PicStep = p.status === 'waiting_pic' ? { label: 'Your approval', state: 'cur', date: '', sub: 'Waiting for you' }
    : p.status === 'changes' ? { label: 'The team is making your changes', state: 'cur', date: '', sub: 'You will get the new minutes on this link' }
    : { label: 'You approved the minutes', state: 'done', date: p.reply?.decision === 'approved' ? day(p.reply.at) : '', sub: '' }
  return [
    { label: 'Kick-off meeting', state: 'done', date: day(p.startedAt), sub: '' },
    { label: 'Minutes sent to you', state: 'done', date: day(p.sentAt), sub: '' },
    yours,
    { label: 'Work starts', state: approved ? 'cur' : 'next', date: '', sub: approved ? 'The team is planning the work' : '' },
  ]
}

/** The card once they have answered. */
export function picAnswered(p: Pick<PicPage, 'status' | 'reply'>): { approved: boolean; title: string; text: string; quote: string; receipt: string } | null {
  const r = p.reply
  if (!r) return null
  if (r.decision === 'approved' && p.status !== 'waiting_pic' && p.status !== 'changes') {
    return { approved: true, title: 'Approved', text: 'You approved the meeting minutes. The team has been told.', quote: '', receipt: `Signed by ${r.name} · ${receiptTime(r.at)}` }
  }
  if (r.decision === 'changes' && p.status === 'changes') {
    return { approved: false, title: 'Changes sent', text: 'The team has your notes and will send the new minutes to this link. You do not need to do anything else for now.',
      quote: r.reason, receipt: `Sent ${receiptTime(r.at)}` }
  }
  return null
}

/** Approve asks a full name; changes ask what should change. As mkt_pic_answer asks them. */
export const nameOk = (name: string) => name.trim().length >= 3 && name.trim().length <= 80
export const reasonOk = (reason: string) => reason.trim().length >= 5 && reason.trim().length <= 500

const PIC_REFUSALS: ReadonlySet<string> = new Set(['P0001', '42501', '22023'])

/** What a stranger reads of a refusal: the database's words written for them, else the call's own (never a
 * constraint's name or Postgres's own text) — the guest link's rule (`guestRefusal`). */
export function picRefusal(error: { code?: string | null; message?: string | null } | null | undefined, fallback: string): string {
  if (!error) return fallback
  const message = typeof error.message === 'string' ? error.message.trim() : ''
  if (!message || typeof error.code !== 'string' || !PIC_REFUSALS.has(error.code)) return fallback
  return /^permission denied\b/i.test(message) ? fallback : message
}
