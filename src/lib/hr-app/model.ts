/**
 * The HR phone app (2026-10-11, HR revamp round 2 — README §17, the handoff's
 * `HR Mobile App.dc.html`): what it draws, worked out from the data the
 * portal's own modules hand it. Pure — the screen (`components/hr-app`) and
 * the tests read the same answers. Every word and colour is the prototype's.
 */

import { formatIntlDate } from '@/lib/utils'
import { SWITCH_VIEWS, phoneWhere, type SwitchTarget } from '@/lib/view-switch'
import type { Notice, Notices } from '@/lib/push/notices'
import type { MyMemo } from '@/lib/memos/model'
import type { MyDocuments } from '@/lib/documentation/personal'
import type { LetterChoice } from '@/lib/documentation/attach'
import type { AttConfig, AttLedger, AttMonth, AttRequest } from '@/lib/attendance/types'
import type { HiringBankReason, HiringField } from '@/lib/hiring/types'
import type { TermReview } from '@/lib/term-reviews'

export type HireStatus = 'submitted' | 'needs_info' | 'acknowledged' | 'filled' | 'cancelled' | 'declined'
export type CandStage = 'shortlisted' | 'appointment' | 'offered' | 'hired' | 'rejected'
export type ChipTone = 'alert' | 'ledger' | 'danger' | 'info' | 'plain'

export interface HrStaff {
  id: string
  name: string
  title: string
  dept: string
}

export interface HrEvent {
  what: string
  when: string
  who: string
  note?: string
}

export interface HrCandidate {
  id: string
  name: string
  phone?: string
  note?: string
  source?: string
  stage: CandStage
  /** Not selected: why the Talent Bank keeps them, in HR's words (2026-10-24). */
  why?: string
}

export interface HrHire {
  id: string
  status: HireStatus
  position: string
  headcount: number
  dept: string
  /** "3,200–3,800" — the form's range, as typed. */
  budget: string
  start: string
  employment?: string
  reason?: string
  age?: string
  gender?: string
  race?: string
  jd?: string
  notes?: string
  ownerName: string | null
  /** Who asked: a person's name, or the subsidiary for a guest-link request. */
  requester: string
  company?: string | null
  /** "9 Oct 2026". */
  when: string
  hired?: string | null
  source?: string | null
  cost?: string | null
  candidates: HrCandidate[]
  events: HrEvent[]
}

export type MemberKind = 'waiting' | 'replacement' | 'claim'

export interface HrMemberRequest {
  id: string
  /** The number HR and the member both quote (`RQ-2610-004`). */
  code: string
  kind: MemberKind
  status: string
  sub: string
  byName: string
  newPerson?: string | null
  contact?: string | null
  start?: string | null
  originalName?: string | null
  pickName?: string | null
  effective?: string | null
  reason?: string | null
  category?: string | null
  location?: string | null
  amount?: string | null
}

export interface HrRoom {
  id: string
  name: string
  seats: number
}

export interface HrBooking {
  id: string
  roomId: string
  date: string
  from: number
  to: number
  title: string
  dept: string
  byName: string
  /** The viewer booked it, so may cancel it. */
  mine: boolean
  guest: boolean
  company?: string | null
  pax: number
}

export interface HrTalent {
  id: string
  name: string
  phone?: string
  email?: string
  position: string
  dept: string
  from?: string | null
  when: string
  notes: string
  /** Why they are kept, in words (2026-10-24) — none for somebody kept before it was asked. */
  reason?: string
}

export interface HrDocType {
  id: string
  name: string
  compulsory: boolean
}

export interface HrLetter {
  id: string
  staffId: string
  /** '' for a published type of HR's own (a memo saved to the Data center). */
  typeId: string
  typeName: string
  file: string
  /** HR Mobile's Letters (2026-10-17): whose, when filed, and where it stands with them. */
  staffName?: string
  filedAt?: string
  readAt?: string | null
  ackAt?: string | null
}

export interface HrAppData {
  /** The viewer's first name for the greeting ("Grace"), else the account's. */
  greetName: string
  /** The viewer's person, when the account is one. */
  meId: string | null
  /** The Principal is viewing the app as this person (View as a person): read-only, and the app says so. */
  viewingAs: string | null
  today: string
  staff: HrStaff[]
  /** Who may own a hiring request: the HR department's people. */
  owners: HrStaff[]
  hires: HrHire[]
  requests: HrMemberRequest[]
  rooms: HrRoom[]
  bookings: HrBooking[]
  sources: string[]
  talents: HrTalent[]
  docTypes: HrDocType[]
  letters: HrLetter[]
  /** Department choices for a booking: its id and name. */
  bookDepts: Array<{ id: string; name: string }>
  /** The parts their tabs open — each the portal page it stands for (`PART_PAGE`, server.ts). */
  parts: {
    requests: boolean; hiring: boolean; insights: boolean; talent: boolean; docs: boolean; rooms: boolean
    /** HR Mobile (2026-10-17): HR › Attendance's Today, Requests, Leave balances, Month close, Records; People. */
    today: boolean; approve: boolean; balances: boolean; close: boolean; records: boolean; people: boolean
  }
  /** The writes behind its buttons, by their page's boxes and the cells: a button they may not use is not drawn. */
  may: {
    attDecide: boolean; decide: boolean; hireApprove: boolean; hireEdit: boolean; hireCreate: boolean; talentEdit: boolean; book: boolean
    /**
     * People · Edit on a person's page: Acknowledge the reminder of a probation's end (2026-10-23) or a contract's
     * (2026-10-24), and since 2026-10-24 a probation's Confirm as permanent and Extend. Absent reads as no.
     */
    termEdit?: boolean
    /**
     * Documentation · Create on a person's page (2026-10-24): a letter filed with Confirm as permanent or Extend — and,
     * with termEdit, Renew, which files the new contract. Absent reads as no.
     */
    letters?: boolean
  }
  /**
   * The Data center's letter types a step's letter is filed as (2026-10-24, `hr_letter_type_choices()`): null while
   * they may not file one. Absent reads as none.
   */
  letterTypes?: LetterChoice[] | null
  /**
   * The probations HR is reminded of (2026-10-23 — the user: "HR 手机 app 里的提醒和推送"): everybody active on
   * probation (`probation_reviews()`, lib/term-reviews.ts), for whoever may acknowledge one. Null while they may
   * not, and while viewing as somebody. Absent reads as none.
   */
  probation?: TermReview[] | null
  /** The contracts, the same way (2026-10-24, `contract_reviews()`). */
  contract?: TermReview[] | null
  /**
   * HR › Attendance as its own readers answer it (2026-10-17, HR Mobile — Today, Approve, a person, Leave balances,
   * Month close, Records): null while none of those pages is open to them. Absent reads as none.
   */
  att?: { config: AttConfig; month: AttMonth; requests: AttRequest[]; ledger: AttLedger | null } | null
  /** Why Attendance could not be read (its own words); null when it was, or was not asked. */
  attError?: string | null
  /** Everybody's mobile by their People record, for Call and Message — only while People is open to them. */
  phones?: Record<string, string>
  /** Home's second line: "Siti Nurhaliza · HR Manager". */
  meLine?: string
  /** Hiring's requester form (Form settings), for "+ New hiring request" — the desktop drawer's fields, in its order. */
  hireFields?: HiringField[]
  /** Why somebody not selected is kept: HR's reasons (Form settings) — the why sheet offers the ones that are on. */
  hireReasons?: HiringBankReason[]
  /** Who may be "Requested by": everybody working here today. */
  hirePeople?: Array<{ id: string; name: string; dept: string }>
  /** The reader's own roster row in Hiring (Requested by defaults to them). */
  hireMe?: string | null
  /** Documentation's company documents (Documents › Company): each shared with its departments. */
  documents?: HrDocument[]
  /** Their notifications (mig 20261011180000): none while viewing as somebody. */
  notices: Notices
  /**
   * The views they may switch between from More (2026-10-11 — one app, lib/one-app.ts): the portal's view
   * switcher, as the Revenue app's module menu has it. Null when the account may not switch, and while it
   * views a person (the banner ends that).
   */
  views?: { current: HrAppView } | null
  /**
   * The login is a person's own, not a shared account like hr@ (2026-10-12): More offers Change password.
   * Never while viewing as somebody. Absent reads as shared.
   */
  personalLogin?: boolean
  /**
   * Their own memos (2026-10-12, mig 20261012210000 — the user: a memo reaches its person in every view and is
   * acknowledged once): every memo addressed to the People record the login holds, with its receipt. None for a
   * shared login, none while viewing as somebody. Absent reads as none.
   */
  memos?: MyMemo[]
  /**
   * Their own documents (2026-10-14, mig 20261014190000 — the user: Documentation in two, company and personal): what
   * HR shares with their department, and what of their own Data center folder HR shares with them. Null for a shared
   * login's nothing, while viewing as somebody, or when it could not be read. Absent reads as none.
   */
  myDocs?: MyDocuments | null
}

/** A company document (Documentation), as HR Mobile's Documents › Company lists it (2026-10-17). */
export interface HrDocument {
  id: string
  name: string
  file: string
  size: number | null
  depts: string[]
  at: string
}

/**
 * A row of the one app's switcher (setViewAs): every view, as every switcher lists them (2026-10-27,
 * lib/view-switch.ts) — or `person`, the portal's View as a person… picker.
 */
export type HrAppView = SwitchTarget

const VIEW_DOT: Readonly<Record<HrAppView, string | null>> = {
  principal: 'rgb(128 96 72)',
  finance: 'rgb(59 104 148)',
  hr: 'rgb(46 125 90)',
  marketing: 'rgb(176 78 124)',
  revenue_member: 'rgb(233 154 83)',
  lead: 'rgb(108 92 160)',
  person: null,
}

/** The switcher's rows: the view, its name (the Revenue app's module menu's), where it opens, its dot (none: the eye). */
export const HR_APP_VIEWS: ReadonlyArray<readonly [HrAppView, string, string, string | null]> = SWITCH_VIEWS.map(
  v => [v.value, v.short, phoneWhere(v.value, 'hr'), VIEW_DOT[v.value]] as const,
)

/** Which row of the switcher an account's view is. */
export function hrAppViewOf(role: string): HrAppView {
  return role === 'finance' || role === 'hr' || role === 'marketing' || role === 'revenue_member' ? role : 'principal'
}

export const CHIP: Readonly<Record<ChipTone, [string, string]>> = {
  alert: ['rgb(249 238 214)', 'rgb(150 100 12)'],
  ledger: ['rgb(222 240 232)', 'rgb(21 110 78)'],
  danger: ['rgb(250 228 224)', 'rgb(176 40 34)'],
  info: ['rgb(238 235 231)', 'rgb(108 104 98)'],
  plain: ['rgb(240 236 230)', 'rgb(90 78 68)'],
}

export const HIRE_STATUS: Readonly<Record<HireStatus, [string, ChipTone]>> = {
  submitted: ['Pending', 'alert'],
  needs_info: ['More info needed', 'alert'],
  acknowledged: ['Acknowledged', 'info'],
  filled: ['Filled', 'ledger'],
  cancelled: ['Cancelled', 'danger'],
  declined: ['Declined', 'danger'],
}

export const CAND_STAGE: Readonly<Record<CandStage, [string, ChipTone]>> = {
  shortlisted: ['Shortlisted', 'plain'],
  appointment: ['Done appointment', 'alert'],
  offered: ['Offered', 'info'],
  hired: ['Hired', 'ledger'],
  rejected: ['Not selected', 'danger'],
}

/** The audit trail's major events (a filled 10px dot); everything else is minor. */
export const MAJOR_EVENTS: readonly string[] = [
  'Submitted', 'Submitted via guest link', 'Acknowledged', 'Filled', 'Cancelled', 'Reopened', 'Owner changed',
  'Candidate status', 'More info requested', 'Declined', 'Interview booked',
]

export const MEMBER_KIND: Readonly<Record<MemberKind, string>> = { waiting: 'Waiting list', replacement: 'Replacement', claim: 'Claim' }
const MEMBER_TAG: Readonly<Record<MemberKind, string>> = { waiting: 'WAIT', replacement: 'REPL', claim: 'CLAIM' }

export const ORANGE = 'rgb(233 154 83)'
export const SLATE = 'rgb(78 101 116)'

/** 540 → "09:00". */
export const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** A day n days on, as YYYY-MM-DD (the office's calendar day, no clock). */
export function shiftDay(day: string, n: number): string {
  const x = new Date(`${day}T00:00:00Z`)
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}

/** en-GB's order with the portal's three-letter month (en-GB writes September "Sept" — CLAUDE.md › Date handling). */
export function dayLabel(day: string, opts: Intl.DateTimeFormatOptions): string {
  return formatIntlDate(new Date(`${day}T00:00:00Z`), { timeZone: 'UTC', ...opts }, 'en-GB')
}

/** "3,200–3,800" → "RM 3,200–3,800"; one end → that end; nothing → "—". */
export function budgetLabel(v: string | null | undefined): string {
  if (!v) return '—'
  const [a, b] = String(v).split('–').map(s => s.trim())
  return 'RM ' + (a && b && a !== b ? `${a}–${b}` : a || b)
}

export function initials(name: string): string {
  return name.split(' ').map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase()
}

export function hireChip(status: HireStatus): { label: string; bg: string; fg: string } {
  const [label, tone] = HIRE_STATUS[status] ?? ['—', 'plain']
  return { label, bg: CHIP[tone][0], fg: CHIP[tone][1] }
}

export function candChip(stage: CandStage): { label: string; bg: string; fg: string; tone: ChipTone } {
  const [label, tone] = CAND_STAGE[stage] ?? CAND_STAGE.shortlisted
  return { label, bg: CHIP[tone][0], fg: CHIP[tone][1], tone }
}

/**
 * A member request's status in words — the Revenue app's own (profile-model.ts), never the raw token (a
 * waiting request read "needs_info" on its page; the phone audit, 2026-10-11).
 */
const REQUEST_STATUS: Readonly<Record<string, string>> = {
  submitted: 'Pending review', needs_info: 'More info needed', approved: 'Approved', rejected: 'Rejected', waiting: 'Accepted',
  reserved: 'Place reserved', accepted: 'Accepted', allocated: 'Joined', executed: 'Completed', paid: 'Paid', withdrawn: 'Cancelled',
  expired: 'Expired', failed: 'Failed · removed', scheduled: 'Scheduled',
}
export function requestStatusLabel(status: string): string {
  return REQUEST_STATUS[status] ?? status.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
}

export const isPendingHire = (h: HrHire) => h.status === 'submitted'
export const isPendingRequest = (r: HrMemberRequest) => r.status === 'submitted' || r.status === 'needs_info'

/** "Senior Revenue Specialist", or "Revenue Specialist × 2" for more than one. */
export const positionLabel = (h: HrHire) => h.position + (h.headcount > 1 ? ` × ${h.headcount}` : '')

/** A member request's one line: the applicant, the swap, or the claim. */
export function requestTitle(r: HrMemberRequest): string {
  if (r.kind === 'waiting') return r.newPerson ?? ''
  if (r.kind === 'replacement') return `${r.originalName ?? '—'} → ${r.pickName || r.newPerson || 'seat released'}`
  return (r.category || 'Claim') + (r.amount ? ` · RM ${r.amount}` : '')
}

export interface ReviewItem {
  k: 'hire' | 'req'
  id: string
  tag: string
  tagBg: string
  tagFg: string
  title: string
  meta: string
  when: string
}

/** Everything waiting for HR: pending hiring requests first, then member requests. */
export function reviewItems(d: Pick<HrAppData, 'hires' | 'requests'>): ReviewItem[] {
  return [
    ...d.hires.filter(isPendingHire).map(h => ({
      k: 'hire' as const, id: h.id, tag: 'HIRE', tagBg: 'rgb(255 244 231)', tagFg: 'rgb(163 78 37)',
      title: positionLabel(h), meta: `${h.company || h.dept} · ${h.requester}`, when: h.when,
    })),
    ...d.requests.filter(isPendingRequest).map(r => ({
      k: 'req' as const, id: r.id, tag: MEMBER_TAG[r.kind] ?? 'REQ', tagBg: 'rgb(230 237 241)', tagFg: SLATE,
      title: requestTitle(r), meta: `${MEMBER_KIND[r.kind]} · ${r.sub} · ${r.byName}`, when: r.code,
    })),
  ]
}

/** The compulsory letter types a person has nothing on file for. */
export function missingFor(d: Pick<HrAppData, 'docTypes' | 'letters'>, staffId: string): string[] {
  return d.docTypes.filter(t => t.compulsory && !d.letters.some(l => l.staffId === staffId && l.typeId === t.id)).map(t => t.name)
}

export const HIRE_FILTERS: ReadonlyArray<{ key: string; label: string; statuses: HireStatus[] }> = [
  { key: 'open', label: 'Open', statuses: ['submitted', 'needs_info', 'acknowledged'] },
  { key: 'submitted', label: 'Pending', statuses: ['submitted'] },
  { key: 'acknowledged', label: 'In progress', statuses: ['acknowledged'] },
  { key: 'filled', label: 'Filled', statuses: ['filled'] },
  { key: 'closed', label: 'Closed', statuses: ['cancelled', 'declined'] },
]

/** The request card's three pills: candidates, at appointment or further, out. */
export function pipeline(cands: readonly HrCandidate[]): Array<{ v: number; l: string }> {
  return [
    { v: cands.length, l: 'cand.' },
    { v: cands.filter(c => c.stage === 'appointment' || c.stage === 'offered' || c.stage === 'hired').length, l: 'appt' },
    { v: cands.filter(c => c.stage === 'rejected').length, l: 'out' },
  ]
}

/** Days from submitted to filled, read off the trail ("Filled" event), for each filled request. */
export function daysToFill(hires: readonly HrHire[]): Array<{ hire: HrHire; days: number }> {
  const parse = (s: string) => Date.parse(`${s} UTC`)
  return hires
    .filter(h => h.status === 'filled')
    .map(h => {
      const filled = h.events.find(e => e.what === 'Filled')?.when
      const days = filled && !Number.isNaN(parse(filled)) && !Number.isNaN(parse(h.when)) ? Math.round((parse(filled) - parse(h.when)) / 86_400_000) : 0
      return { hire: h, days }
    })
}

/** The book sheet's From / To: every half hour from 08:00 to 20:00. */
export const bookingTimes = (): Array<{ v: string; l: string }> => {
  const out: Array<{ v: string; l: string }> = []
  for (let m = 480; m <= 1200; m += 30) out.push({ v: String(m), l: hm(m) })
  return out
}

/** The timeline's tap: the 30-minute slot under the finger, no later than 19:30. */
export function slotAt(offsetY: number, columnHeight: number): number {
  const m = 480 + Math.floor(((offsetY / columnHeight) * 720) / 30) * 30
  return Math.min(Math.max(m, 480), 1170)
}

/** A booking started from a pressed half hour: an hour long, but never past 20:00 — the day's end, past which the server refuses it. */
export function hourFrom(from: number): number {
  return Math.min(from + 60, 1200)
}

/** A booking that overlaps the asked slot in the same room on the same day. */
export function clashOf(bookings: readonly HrBooking[], roomId: string, date: string, from: number, to: number): HrBooking | null {
  return bookings.find(b => b.roomId === roomId && b.date === date && b.from < to && from < b.to) ?? null
}

// ── Notifications (2026-10-11, mig 20261011180000) ──

/** A memo's tag (2026-10-12): the olive of Documentation's kind tag. */
export const MEMO_TAG = { tag: 'MEMO', bg: 'rgb(238 240 226)', fg: 'rgb(88 98 68)' } as const

/** A probation's tag (2026-10-23): the design system's warning pair, as the roster's Probation chip wears it. */
export const PROBATION_TAG = { tag: 'PROB', bg: 'var(--ds-warning-bg)', fg: 'var(--ds-warning)' } as const

/** A contract's tag (2026-10-24): the design system's accent-soft pair — the peach of the roster's Contract chip. */
export const CONTRACT_TAG = { tag: 'CONT', bg: 'var(--ds-accent-soft)', fg: 'var(--ds-accent-soft-ink)' } as const

/**
 * A notice's tag, in the Review list's own colours: HIRE (a hiring request), ROOM (a meeting), REQ (a member's
 * request), MEMO (a memo or letter for them — 2026-10-12).
 */
export function noticeTag(n: Pick<Notice, 'refKind'> & { title?: string }): { tag: string; bg: string; fg: string } {
  if (n.refKind === 'hiring_request') return { tag: 'HIRE', bg: 'rgb(255 244 231)', fg: 'rgb(163 78 37)' }
  if (n.refKind === 'booking') return { tag: 'ROOM', bg: 'rgb(230 237 241)', fg: 'rgb(78 101 116)' }
  if (n.refKind === 'memo') return { ...MEMO_TAG }
  // An IT request (2026-10-20): the desk's or its sender's — it opens in the Revenue app.
  if (n.refKind === 'it_request') return { tag: 'IT', bg: 'rgb(230 237 241)', fg: 'rgb(78 101 116)' }
  // A probation ending (2026-10-23): the person — the amber of the roster's Probation chip; a contract's (2026-10-24,
  // notify_term_ends titles it so), the peach of its.
  if (n.refKind === 'hr_staff') return n.title?.startsWith('Contract ending') ? { ...CONTRACT_TAG } : { ...PROBATION_TAG }
  return { tag: 'REQ', bg: 'rgb(240 236 230)', fg: 'rgb(78 52 38)' }
}

/** `5 min`, `3 h`, then the day — how long ago, as the Revenue app's bell says it. */
export function noticeAgo(iso: string, now: Date): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const minutes = Math.max(0, Math.round((now.getTime() - t) / 60_000))
  if (minutes < 60) return `${Math.max(1, minutes)} min`
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h`
  return formatIntlDate(new Date(t), { day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' })
}

/** New first, then the rest — the bell's two cards. */
export function noticeGroups(n: Notices): { fresh: Notice[]; earlier: Notice[] } {
  return { fresh: n.items.filter(x => !x.read), earlier: n.items.filter(x => x.read) }
}
