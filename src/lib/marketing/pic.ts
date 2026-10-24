// The PIC's link (⑤-1, `PIC Link.dc.html`): what mkt_pic_page answers the stranger holding a product project's code —
// for whom and on what, where it stands, why it waits again, the intake minutes' fields the PIC sees, the work (②b-2d:
// each deliverable, the stage waiting for them and what they may see of it) — and, from it, the status, the banner,
// the progress, the card after an answer, and what an answer asks. Pure.

import { officeTime } from '@/lib/office-time'
import { shortDay } from './board'
import { picOkFromRow, type PicOk, type Tone } from './task'

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
  /** Which of the project's PICs holds this link (the user's answer 29: one or two, each their own link — mig
   * 20261025034000), their name, and the other PIC's when there is one. */
  you: PicNo
  pic: string | null
  other: string | null
  /** The last answer on the minutes — either PIC's, `pic` saying whose. */
  reply: { decision: 'approved' | 'changes'; name: string; reason: string; at: string | null; pic: PicNo } | null
  /** Waiting again because something they see changed after an approval: which fields — and whether the approval taken
   * back was this PIC's (`mine`), or only the other's (`by`, their name — ②b-2d-2b). */
  updated: { fields: string; at: string | null; mine: boolean; by: string | null } | null
  /** Waiting again after the changes they asked for: what they asked. */
  asked: { reason: string; at: string | null } | null
  /** The minutes wait for both PICs (the template asks it, the project has two — mig 20261025035000), and whose
   * approvals this sending has. */
  both: boolean
  ok: PicOk | null
  minutes: { title: string; fields: PicField[] }
  /** The work (②b-2d): each deliverable planned, and its stage now. */
  work: PicWork[]
}

/** A stage's field as the PIC reads it: words (a date as written, Yes for a box ticked), a link, or nothing yet. */
export interface PicWorkField {
  name: string
  type: string
  value: string | null
}

export interface PicWork {
  id: string
  title: string
  status: 'active' | 'paused' | 'done'
  startsOn: string | null
  dueOn: string | null
  stages: number
  done: number
  stage: {
    idx: number
    name: string
    status: string
    dueOn: string | null
    /** The version the team sent — their answer names it. */
    ver: number
    /** Waiting for THIS PIC's approval now — no longer, on a level asking both, once they approved. */
    waiting: boolean
    /** Its level asks both PICs, and whose approvals this version has. */
    both: boolean
    ok: PicOk | null
    note: string | null
    fields: PicWorkField[]
    links: { url: string; label: string }[]
  } | null
  /** The last answer on it — either PIC's. */
  last: { action: 'pic approved' | 'pic changes'; name: string; reason: string; stage: string; version: string; at: string | null; pic: PicNo } | null
}

/** The first PIC or the second. An answer from before there were two is the first's. */
export type PicNo = 1 | 2
const picNo = (v: unknown): PicNo => (v === 2 ? 2 : 1)
/** "Kelvin Tan (PIC)" as the trail names a PIC — their name alone. */
const bare = (name: string) => name.replace(/ \(PIC\)$/, '')

/** Where an approval asking both PICs stands for the one holding this link: they approved (and it waits for the other),
 * or the other did (and it waits for them) — else null (either PIC's counts, or nobody's is in yet). */
export function bothState(both: boolean, ok: PicOk | null, you: PicNo, other: string | null): { mine: true; other: string } | { mine: false; theirs: string } | null {
  if (!both || !ok) return null
  const me = String(you) as '1' | '2'
  const them = String(3 - you) as '1' | '2'
  if (ok[me]) return { mine: true, other: other || 'the other PIC' }
  if (ok[them]) return { mine: false, theirs: ok[them]?.name || other || 'The other PIC' }
  return null
}

/** Minutes both PICs approved (②b-2d-2b): the other PIC's name, for "You and <name>" — else null. */
function bothApproved(p: Partial<Pick<PicPage, 'both' | 'ok' | 'other' | 'you'>>): string | null {
  const ok = p.both ? p.ok : null
  if (!ok?.['1'] || !ok['2']) return null
  return ok[String(3 - (p.you ?? 1)) as '1' | '2']?.name || p.other || 'the other PIC'
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

function workValue(type: string, v: unknown): string | null {
  if (typeof v === 'boolean') return v ? 'Yes' : null
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string' && v.trim()) return type === 'Date' ? dateWords(v.trim()) : v.trim()
  return null
}

function workFromRow(w: Record<string, unknown>): PicWork {
  const s = isObj(w.stage) ? w.stage : null
  const last = isObj(w.last) ? w.last : null
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)
  return {
    id: str(w.id),
    title: str(w.title),
    status: w.status === 'done' ? 'done' : w.status === 'paused' ? 'paused' : 'active',
    startsOn: strOrNull(w.startsOn),
    dueOn: strOrNull(w.dueOn),
    stages: n(w.stages),
    done: n(w.done),
    stage: s ? {
      idx: n(s.idx),
      name: str(s.name),
      status: str(s.status),
      dueOn: strOrNull(s.dueOn),
      ver: n(s.ver),
      waiting: s.waiting === true,
      both: s.both === true,
      ok: picOkFromRow(s.ok),
      note: strOrNull(s.note),
      fields: (Array.isArray(s.fields) ? s.fields : []).filter(isObj).map(f => ({ name: str(f.name), type: str(f.type), value: workValue(str(f.type), f.value) })),
      links: (Array.isArray(s.links) ? s.links : []).filter(isObj).filter(l => /^https:\/\//i.test(str(l.url))).map(l => ({ url: str(l.url), label: str(l.label) })),
    } : null,
    last: last && (last.action === 'pic approved' || last.action === 'pic changes')
      ? { action: last.action, name: str(last.name), reason: str(last.reason), stage: str(last.stage), version: str(last.version), at: strOrNull(last.at),
          pic: picNo(last.pic) }
      : null,
  }
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
    you: picNo(v.you),
    pic: strOrNull(v.pic),
    other: strOrNull(v.other),
    reply: reply
      ? { decision: reply.decision === 'approved' ? 'approved' : 'changes', name: str(reply.name), reason: str(reply.reason), at: strOrNull(reply.at),
          pic: picNo(reply.pic) }
      : null,
    updated: updated ? { fields: str(updated.fields), at: strOrNull(updated.at), mine: updated.mine !== false, by: strOrNull(updated.by) } : null,
    asked: asked ? { reason: str(asked.reason), at: strOrNull(asked.at) } : null,
    both: v.both === true,
    ok: picOkFromRow(v.ok),
    minutes: {
      title: str(minutes.title),
      fields: (Array.isArray(minutes.fields) ? minutes.fields : []).filter(isObj)
        .map(f => ({ name: str(f.name), type: str(f.type), value: valueFromRow(str(f.type), f.value) })),
    },
    work: (Array.isArray(v.work) ? v.work : []).filter(isObj).map(workFromRow),
  }
}

/** Where a deliverable stands, in the PIC's words — the changes theirs, or the other PIC's (`you` — whose link). */
export function workState(w: PicWork, today: string, you: PicNo = 1, other: string | null = null): { label: string; tone: Tone } {
  if (w.status === 'done') return { label: 'Done', tone: 'done' }
  if (w.status === 'paused') return { label: 'Paused', tone: 'draft' }
  if (w.startsOn && today && w.startsOn > today) return { label: `Starts ${shortDay(w.startsOn)}`, tone: 'draft' }
  if (w.stage?.waiting) return { label: 'Waiting for your approval', tone: 'waiting' }
  // A level asking both PICs, theirs in: it waits for the other (②b-2d-2b).
  const both = w.stage && w.stage.status === 'review' ? bothState(w.stage.both, w.stage.ok, you, other) : null
  if (both?.mine) return { label: `Waiting for ${both.other}`, tone: 'waiting' }
  if (w.stage?.status === 'changes' && w.last?.action === 'pic changes') {
    return { label: w.last.pic === you ? 'The team is making your changes' : `The team is making ${bare(w.last.name)}’s changes`, tone: 'draft' }
  }
  return { label: w.stage ? `In progress · ${w.stage.name}` : 'In progress', tone: 'draft' }
}

/** A deliverable's last answer in a line: theirs ("You approved …") or the other PIC's ("Hana Lee approved …"). */
export function workLastLine(last: NonNullable<PicWork['last']>, you: PicNo): string {
  const who = last.pic === you ? 'You' : bare(last.name)
  return last.action === 'pic approved'
    ? `${who} approved ${last.stage} ${last.version} · signed by ${bare(last.name)} · ${receiptTime(last.at)}`
    : `${who} asked for changes on ${last.stage}: “${last.reason}” · ${receiptTime(last.at)}`
}

/** How many wait for the PIC now. */
export const workWaiting = (work: readonly PicWork[]) => work.filter(w => w.stage?.waiting).length

/** Changes on a stage ask what should change — as mkt_pic_stage_answer asks (5–1,000). */
export const stageReasonOk = (reason: string) => reason.trim().length >= 5 && reason.trim().length <= 1000

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
export function picBanner(p: Pick<PicPage, 'status' | 'updated' | 'asked'> & Partial<Pick<PicPage, 'you' | 'reply' | 'both' | 'ok' | 'other'>>, overdue = false): { tone: Tone; title: string; text: string } | null {
  if (p.status === 'waiting_pic') {
    const late = (title: string) => (overdue ? 'Overdue — please review' : title)
    const tone: Tone = overdue ? 'red' : 'waiting'
    // Both PICs sign off (②b-2d-2b): theirs is in — it waits for the other; or the other's is — it waits for them.
    const both = bothState(!!p.both, p.ok ?? null, p.you ?? 1, p.other ?? null)
    if (both?.mine) return { tone: 'waiting', title: `Waiting for ${both.other}`, text: `You approved the minutes. They go ahead once ${both.other} approves too.` }
    if (both && !both.mine) return { tone, title: late('Waiting for your approval'), text: `${both.theirs} approved the minutes. They go ahead once you approve too.` }
    // Changed after an approval: theirs — or only the other PIC's, whom it names (②b-2d-2b).
    if (p.updated) {
      return p.updated.mine
        ? { tone, title: late('Updated after your approval — please review again'), text: `The team changed ${p.updated.fields || 'the minutes'}.` }
        : { tone, title: late('Updated — please review'), text: `The team changed ${p.updated.fields || 'the minutes'} after ${p.updated.by || 'the other PIC'} approved.` }
    }
    // The changes were theirs, or the other PIC's (the reply resent still says whose).
    const asker = p.reply && p.reply.pic !== (p.you ?? 1) ? p.reply.name : 'You'
    if (p.asked) return { tone, title: late('Updated — please review again'), text: `${asker} asked: “${p.asked.reason}”` }
    return { tone, title: late('Waiting for your approval'), text: 'The meeting minutes are ready. Please review them below.' }
  }
  if (p.status === 'approved') return { tone: 'done', title: 'Approved', text: 'Thank you. Nothing else needs your action right now.' }
  return null
}

export type PicStep = { label: string; state: 'done' | 'cur' | 'next'; date: string; sub: string }

/** The progress: the meeting, the minutes sent, their approval, the work. Minutes that asked no sign-off never went to
 * the PIC (no sending, no answer) — the team completed them; the link is theirs for the work (②b-2d). */
export function picTimeline(p: Pick<PicPage, 'status' | 'startedAt' | 'sentAt' | 'reply'> & Partial<Pick<PicPage, 'you' | 'both' | 'ok' | 'other'>> & { work?: readonly PicWork[] }): PicStep[] {
  const approved = p.status !== 'waiting_pic' && p.status !== 'changes'
  if (approved && !p.sentAt && !p.reply) {
    return [
      { label: 'Kick-off meeting', state: 'done', date: day(p.startedAt), sub: '' },
      { label: 'Minutes completed by the team', state: 'done', date: '', sub: '' },
      workStep(p.work ?? [], approved),
    ]
  }
  // The answer was theirs, or the other PIC's (either one's counts — the user's answer 29).
  const other = p.reply && p.reply.pic !== (p.you ?? 1) ? p.reply.name : null
  const pair = bothApproved(p)
  // Both PICs sign off (②b-2d-2b): whose approval is in while the minutes wait.
  const both = bothState(!!p.both, p.ok ?? null, p.you ?? 1, p.other ?? null)
  const yours: PicStep = p.status === 'waiting_pic'
    ? both?.mine ? { label: `Waiting for ${both.other}`, state: 'cur', date: '', sub: 'You approved the minutes' }
      : { label: 'Your approval', state: 'cur', date: '', sub: both ? `${both.theirs} approved — waiting for you` : 'Waiting for you' }
    : p.status === 'changes' ? { label: other ? `The team is making ${other}’s changes` : 'The team is making your changes', state: 'cur', date: '', sub: 'You will get the new minutes on this link' }
    : { label: pair ? `You and ${pair} approved the minutes` : other ? `${other} approved the minutes` : 'You approved the minutes', state: 'done', date: p.reply?.decision === 'approved' ? day(p.reply.at) : '', sub: '' }
  return [
    { label: 'Kick-off meeting', state: 'done', date: day(p.startedAt), sub: '' },
    { label: 'Minutes sent to you', state: 'done', date: day(p.sentAt), sub: '' },
    yours,
    workStep(p.work ?? [], approved),
  ]
}

/** The last step: the work to come — or, once under way, how far it has come (②b-2d). */
function workStep(work: readonly PicWork[], approved: boolean): PicStep {
  if (!work.length) return { label: 'Work starts', state: approved ? 'cur' : 'next', date: '', sub: approved ? 'The team is planning the work' : '' }
  const done = work.filter(w => w.status === 'done').length
  const waiting = workWaiting(work)
  return { label: 'The work', state: done >= work.length ? 'done' : 'cur', date: '', sub: `${done} of ${work.length} done${waiting ? ` · ${waiting} waiting for you` : ''}` }
}

/** The card once the minutes are answered — by them, or by the other PIC (either one's answer counts). */
export function picAnswered(p: Pick<PicPage, 'status' | 'reply'> & Partial<Pick<PicPage, 'you' | 'both' | 'ok' | 'other'>>): { approved: boolean; title: string; text: string; quote: string; receipt: string } | null {
  const r = p.reply
  if (!r) return null
  const theirs = r.pic === (p.you ?? 1)
  if (r.decision === 'approved' && p.status !== 'waiting_pic' && p.status !== 'changes') {
    // Both PICs signed off (②b-2d-2b): theirs counted as much as the last one's.
    const pair = bothApproved(p)
    if (pair && p.ok?.['1'] && p.ok['2']) {
      return { approved: true, title: 'Approved', text: `You and ${pair} approved the meeting minutes. The team has been told.`, quote: '',
        receipt: `Signed by ${p.ok['1'].name} and ${p.ok['2'].name} · ${receiptTime(r.at)}` }
    }
    return { approved: true, title: 'Approved', text: `${theirs ? 'You' : r.name} approved the meeting minutes. The team has been told.`, quote: '',
      receipt: `Signed by ${r.name} · ${receiptTime(r.at)}` }
  }
  if (r.decision === 'changes' && p.status === 'changes') {
    return { approved: false, title: 'Changes sent',
      text: theirs
        ? 'The team has your notes and will send the new minutes to this link. You do not need to do anything else for now.'
        : `The team has ${r.name}’s notes and will send the new minutes to this link. You do not need to do anything else for now.`,
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
