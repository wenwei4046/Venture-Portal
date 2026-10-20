/**
 * Sales Groups' Waiting list and Replacement list (2026-10-10, the HR revamp):
 * one sub-department's waiting-list and replacement requests as
 * `member_sub_department_requests(sub)` answers them (mig 20261010130000),
 * and the words and order the two tabs show them in. Read-only here: they are
 * decided in Member services.
 *
 * Pure, so the tabs stay thin and this is tested.
 */

import { formatIntlDate } from '@/lib/utils'
import { joiningLabel } from '@/lib/member/waiting-start'

export interface RequestEvent {
  /** The status it moved to. */
  to: string
  at: string
  note: string | null
  /** A staff name, or the role of the login that moved it ("HR"). */
  by: string | null
}

/**
 * An applicant's signed application form (2026-10-20, the user: "view for the letter they submit, then can be
 * upload as well"): the file a member sent with Submit waiting list, or HR attached with "+" or in the drawer —
 * the one the request names now (mig 20261020130000).
 */
export interface SignedForm {
  /** As its sender's file was named. */
  name: string
  /** application/pdf · image/png · image/jpeg. */
  type: string
  /** When it was uploaded. */
  at: string
  /** Who uploaded it: a staff name, or their login's role ("HR"). */
  by: string | null
}

export interface SubDeptRequest {
  id: string
  requestNo: string | null
  kind: 'waiting' | 'replacement'
  status: string
  createdAt: string
  submittedAt: string | null
  /** The member who sent it. */
  submittedBy: string | null
  newPerson: string | null
  contact: string | null
  /** Waiting list: the preferred joining date (YYYY-MM-DD), or `anytime` — ready whenever HR calls them. */
  start: string | null
  signature: string | null
  /** Replacement: the member being replaced. */
  original: string | null
  /** Replacement: member_exit · resignation · transfer. */
  destination: string | null
  /** Replacement: new · existing · waiting · vacancy. */
  replacementSource: string | null
  /** Replacement: the planned effective date (YYYY-MM-DD). */
  effective: string | null
  reason: string | null
  /** Replacement by transfer: the receiving sub-department. */
  target: string | null
  /** When HR accepted the applicant onto the waiting list. */
  acceptedAt: string | null
  /** Waiting list: the signed form on file, or null (none yet, or read before mig 20261020130000). */
  signedForm?: SignedForm | null
  events: RequestEvent[]
}

export type RequestTone = 'alert' | 'ledger' | 'danger' | 'info' | 'plain'

/** A status in words and its chip's tone — Member services' words. */
export const REQUEST_STATUS: Record<string, { name: string; tone: RequestTone }> = {
  submitted: { name: 'Pending review', tone: 'alert' },
  needs_info: { name: 'More information needed', tone: 'alert' },
  approved: { name: 'Approved', tone: 'ledger' },
  rejected: { name: 'Rejected', tone: 'danger' },
  waiting: { name: 'Waiting', tone: 'alert' },
  reserved: { name: 'Reserved', tone: 'alert' },
  accepted: { name: 'Applicant confirmed', tone: 'alert' },
  allocated: { name: 'Allocated', tone: 'info' },
  executed: { name: 'Completed', tone: 'info' },
  withdrawn: { name: 'Withdrawn', tone: 'plain' },
  expired: { name: 'Expired', tone: 'plain' },
  scheduled: { name: 'Scheduled', tone: 'alert' },
  failed: { name: 'Failed · removed', tone: 'danger' },
}

export function statusOf(status: string): { name: string; tone: RequestTone } {
  return REQUEST_STATUS[status] ?? { name: status, tone: 'plain' }
}

/** What a history step says. */
const EVENT_WORDS: Record<string, string> = {
  submitted: 'Submitted',
  needs_info: 'More information requested',
  approved: 'Approved',
  rejected: 'Rejected',
  waiting: 'Accepted onto the waiting list',
  reserved: 'Seat reserved',
  accepted: 'Applicant confirmed',
  allocated: 'Allocated',
  executed: 'Completed',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
  scheduled: 'Scheduled',
  failed: 'Failed · removed from the list',
}

/**
 * Where a status falls in a request's life — the order two moves made in one
 * transaction (one timestamp) are read in: a replacement approved for a date
 * that has come is Scheduled, then Completed, at the same instant.
 */
const STEP_ORDER: Record<string, number> = {
  draft: 0, submitted: 1, needs_info: 2, approved: 3, waiting: 3, reserved: 4, accepted: 5, scheduled: 6, allocated: 7,
}

/** The note `member_prepare_request` writes on a member's edit (mig 20261010190000). */
const UPDATED = 'Updated by the member'

/** The note `member_waiting_add` puts on the step onto the list (mig 20261011230000). */
export const ADDED_NOTE = 'Added on Sales Groups'

/** Put on the list with "+" on Sales Groups (2026-10-11) — never sent by a member, never signed. */
export function addedHere(r: Pick<SubDeptRequest, 'kind' | 'events'>): boolean {
  return r.kind === 'waiting' && r.events.some(e => e.to === 'waiting' && e.note === ADDED_NOTE)
}

/**
 * The note `member_waiting_attach_form` puts on its step (mig 20261020130000): HR uploaded the signed form in the
 * applicant's drawer — "Signed form uploaded · <file>". A step with no move: the status stays as it was.
 */
export const FORM_UPLOADED = 'Signed form uploaded'

/**
 * The history a person reads: one step per status it moved to. The database
 * writes a status change once from the app and, on some paths, once more from
 * its own trigger; the same move a second later is the same step. A member's
 * edit is a step of its own — "Updated by the member", its note what changed
 * (the handoff: "Changed: phone number, preferred start date"). A draft is
 * nobody's step: it is the request being written. HR's "+" puts somebody on
 * the list without a member ever sending it — "Added to the waiting list".
 * A signed form HR uploads in the drawer is a step of its own too (2026-10-20),
 * its note the file's name.
 */
export function historyOf(events: readonly RequestEvent[]): Array<RequestEvent & { what: string }> {
  const out: Array<RequestEvent & { what: string }> = []
  const order = (e: RequestEvent) => STEP_ORDER[e.to] ?? 9
  for (const e of [...events].sort((a, b) => a.at.localeCompare(b.at) || order(a) - order(b))) {
    if (e.to === 'draft') continue
    const updated = e.to === 'submitted' && !!e.note && e.note.startsWith(UPDATED)
    const uploaded = !!e.note && e.note.startsWith(`${FORM_UPLOADED} · `)
    const last = out[out.length - 1]
    if (last && last.to === e.to && !updated && !uploaded) {
      if (!last.by && e.by) last.by = e.by
      if (!last.note && e.note) last.note = e.note
      continue
    }
    if (uploaded) {
      out.push({ ...e, what: FORM_UPLOADED, note: e.note!.slice(FORM_UPLOADED.length + 3) || null })
    } else if (updated) {
      const changed = e.note!.slice(UPDATED.length).replace(/^\s*·\s*/, '')
      out.push({ ...e, what: UPDATED, note: changed ? `Changed: ${changed}` : null })
    } else if (e.to === 'waiting' && e.note === ADDED_NOTE) {
      out.push({ ...e, what: 'Added to the waiting list', note: null })
    } else {
      out.push({ ...e, what: EVENT_WORDS[e.to] ?? e.to })
    }
  }
  return out
}

/** Still on the list: accepted onto it and not yet placed, failed or gone. */
const ON_THE_LIST = new Set(['waiting', 'reserved', 'accepted'])

/**
 * The waiting list: the applicants HR accepted, numbered in the order they
 * were accepted (the handoff: "ranked #1 #2 … by acceptance") — the first move
 * into `waiting`, else when it was sent.
 */
export function waitingList(rows: readonly SubDeptRequest[]): Array<SubDeptRequest & { position: number }> {
  const when = (r: SubDeptRequest) => r.acceptedAt ?? r.submittedAt ?? r.createdAt
  return rows
    .filter(r => r.kind === 'waiting' && ON_THE_LIST.has(r.status))
    .sort((a, b) => when(a).localeCompare(when(b)) || a.createdAt.localeCompare(b.createdAt))
    .map((r, i) => ({ ...r, position: i + 1 }))
}

/** Settled — nothing left for anybody to do on it. */
const SETTLED = new Set(['executed', 'rejected', 'withdrawn', 'expired'])

/** Every replacement of the sub-department, in the order they were sent. */
export function replacementList(rows: readonly SubDeptRequest[]): SubDeptRequest[] {
  return rows
    .filter(r => r.kind === 'replacement')
    .sort((a, b) => (a.submittedAt ?? a.createdAt).localeCompare(b.submittedAt ?? b.createdAt))
}

/** The Replacement list tab's count: those still in hand. */
export function openReplacements(rows: readonly SubDeptRequest[]): number {
  return replacementList(rows).filter(r => !SETTLED.has(r.status)).length
}

export const DESTINATION_WORDS: Record<string, string> = {
  member_exit: 'Leave this department only',
  resignation: 'Leave the company',
  transfer: 'Transfer to another department',
}

export const SOURCE_WORDS: Record<string, string> = {
  new: 'New member joining',
  existing: 'Existing member',
  waiting: 'Waiting List',
  vacancy: 'Release the position without a replacement',
}

/** "Marcus → Ryan Tan", or "Louis → seat released". */
export function replacementTitle(r: Pick<SubDeptRequest, 'original' | 'newPerson' | 'replacementSource'>): string {
  const original = r.original ?? 'A member'
  const incoming = r.replacementSource === 'vacancy' || !r.newPerson ? 'seat released' : r.newPerson
  return `${original} → ${incoming}`
}

/** The arrangement, in words — a transfer names where to. */
export function arrangementOf(r: Pick<SubDeptRequest, 'destination' | 'target'>): string {
  if (!r.destination) return '—'
  const words = DESTINATION_WORDS[r.destination] ?? r.destination
  return r.destination === 'transfer' && r.target ? `${words} · ${r.target}` : words
}

const OFFICE = 'Asia/Kuala_Lumpur'

/** "11 Sep 2026" — a YYYY-MM-DD as the office's calendar day. */
export function dayLabel(date: string | null): string {
  if (!date) return '—'
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00+08:00` : date)
  if (Number.isNaN(d.getTime())) return '—'
  return formatIntlDate(d, { day: 'numeric', month: 'short', year: 'numeric', timeZone: OFFICE }, 'en-GB')
}

/** The joining date: "11 Sep 2026", or "Any time ready" (2026-10-14). */
export function joiningDayLabel(start: string | null): string {
  return joiningLabel(start, dayLabel)
}

/** "9 Sep" — a history step's day. */
export function shortDay(at: string): string {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ''
  return formatIntlDate(d, { day: 'numeric', month: 'short', timeZone: OFFICE }, 'en-GB')
}
