import { officeDay } from '@/lib/office-time'
import type { ChipTone } from '@/components/hrv/kit'
import type {
  CandidateField,
  CandidateStage,
  HiringBoard,
  HiringCandidate,
  HiringEvent,
  HiringField,
  HiringPerson,
  HiringRequest,
  HiringStatus,
  HiringTalent,
} from './types'

// What the Hiring pages say about a request, a candidate, a talent — the
// handoff's own words and tones (`.design/hr-r2/handoff/design/Revenue
// App.dc.html`: HIRE_ST, CAND_ST, MAJOR, bfmt, evMap, hireVals, rvVals). Pure,
// shared by the portal's pages and the HR phone app.

export const STATUS: Readonly<Record<HiringStatus, { label: string; tone: ChipTone }>> = {
  needs_info: { label: 'More info needed', tone: 'alert' },
  declined: { label: 'Declined', tone: 'danger' },
  submitted: { label: 'Pending', tone: 'alert' },
  acknowledged: { label: 'Acknowledged', tone: 'info' },
  filled: { label: 'Filled', tone: 'ledger' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
}

export type StageTone = 'plain' | 'alert' | 'info' | 'ledger' | 'danger'
export const STAGE: Readonly<Record<CandidateStage, { label: string; tone: StageTone }>> = {
  shortlisted: { label: 'Shortlisted', tone: 'plain' },
  appointment: { label: 'Done appointment', tone: 'alert' },
  offered: { label: 'Offered', tone: 'info' },
  hired: { label: 'Hired', tone: 'ledger' },
  rejected: { label: 'Not selected', tone: 'danger' },
}
export const STAGE_ORDER: readonly CandidateStage[] = ['shortlisted', 'appointment', 'offered', 'hired', 'rejected']

/** The trail's major steps — a status of the request itself (a filled dot, "STATUS"). */
export const MAJOR_EVENTS: ReadonlySet<string> = new Set([
  'More info requested', 'Declined', 'Submitted', 'Submitted via guest link', 'Acknowledged', 'Filled', 'Cancelled',
  'Reopened', 'Owner changed', 'Candidate status', 'Interview booked',
])

/** The open requests: still to decide or being worked on. */
export const OPEN: ReadonlySet<HiringStatus> = new Set(['submitted', 'acknowledged'])

/** "9 Oct 2026" — the office's day of an instant (or a bare date). */
export function dayLabel(at: string | null | undefined): string {
  if (!at) return ''
  return officeDay(at).format('D MMM YYYY')
}

/** The office's day as YYYY-MM-DD. */
export function dayKey(at: string): string {
  return officeDay(at).format('YYYY-MM-DD')
}

/** Whole days from one office day to another. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${dayKey(from)}T00:00:00Z`)
  const b = Date.parse(`${dayKey(to)}T00:00:00Z`)
  return Math.round((b - a) / 86400000)
}

export function answerOf(r: Pick<HiringRequest, 'answers'>, id: string): string {
  return r.answers[id] ?? ''
}

export function headcountOf(r: Pick<HiringRequest, 'answers'>): number {
  const n = Number(answerOf(r, 'headcount'))
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1
}

/** "Revenue Specialist × 2" — the position, and how many when more than one. */
export function requestTitle(r: Pick<HiringRequest, 'answers'>): string {
  const n = Number(answerOf(r, 'headcount'))
  return answerOf(r, 'position') + (n > 1 ? ' × ' + answerOf(r, 'headcount') : '')
}

const thousands = (s: string) => (/^\d+(\.\d+)?$/.test(s) ? Number(s).toLocaleString('en-US') : s)

/** A range's answer "3200–3800" as money: "RM 3,200 – 3,800"; "—" when blank. */
export function budgetText(v: string | null | undefined): string {
  if (!v) return '—'
  const [a = '', b = ''] = String(v).split('–').map(s => s.trim())
  if (!a && !b) return '—'
  return 'RM ' + (a && b && a !== b ? thousands(a) + ' – ' + thousands(b) : thousands(a || b))
}

/** "RM 450" — a cost as the handoff writes it (whole ringgit unless there are sen). */
export function costText(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return 'RM ' + (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
}

/** Where a request came from: a guest's company, else the requester's department, else the company. */
export function requesterOrg(r: Pick<HiringRequest, 'requesterCompany' | 'requesterDepartment'>): string {
  return r.requesterCompany || r.requesterDepartment || 'HOUZS Venture'
}

/** The review's line: "From Kar Jun · Revenue · submitted 9 Oct 2026". */
export function fromLine(r: HiringRequest): string {
  const company = r.requesterCompany || r.requesterDepartment || 'HOUZS Venture'
  return 'From ' + r.requesterName + ' · ' + company + (r.source === 'guest' ? ' (guest link)' : '') + ' · submitted ' + dayLabel(r.submittedAt)
}

/** A request page's line: "Requested by Kar Jun · Revenue · submitted 9 Oct 2026 · hired …". */
export function pageMeta(r: HiringRequest): string {
  return 'Requested by ' + r.requesterName + ' · ' + requesterOrg(r) + (r.source === 'guest' ? ' (guest link)' : '')
    + ' · submitted ' + dayLabel(r.submittedAt) + (r.status === 'filled' && r.hiredNames.length ? ' · hired ' + r.hiredNames.join(', ') : '')
}

export function personName(board: Pick<HiringBoard, 'people'>, id: string | null | undefined): string {
  if (!id) return ''
  return board.people.find(p => p.id === id)?.name ?? ''
}

/** Who may own a hire: HR's own people. */
export function hrOwners(board: Pick<HiringBoard, 'people'>): HiringPerson[] {
  return board.people.filter(p => p.department === 'HR')
}

/** Who may be recorded as helping: HR, and the team's leads and managers — never the owner. */
export function assistOptions(board: Pick<HiringBoard, 'people'>, ownerId: string | null): HiringPerson[] {
  return board.people.filter(p => p.id !== ownerId && (p.department === 'HR' || /leader|manager|director/i.test(p.title)))
}

/** The fields a request shows as tiles, with the three it is about first. */
const HIGHLIGHT = ['budget', 'headcount', 'start']

export interface Tile {
  label: string
  value: string
  highlight: boolean
}

function fieldValue(r: HiringRequest, f: HiringField): string {
  if (f.id === 'budget' || (f.type === 'range' && /rm|budget/i.test(f.label))) return budgetText(answerOf(r, f.id))
  const v = answerOf(r, f.id)
  if (f.type === 'range') {
    const [a = '', b = ''] = v.split('–').map(s => s.trim())
    return a || b ? (a && b && a !== b ? `${a}–${b}` : a || b) : '—'
  }
  return v || '—'
}

const labelOf = (r: HiringRequest, id: string, fallback: string) => r.fields.find(f => f.id === id)?.label ?? fallback

/** The review's tiles: Budget, Headcount, Expected start (highlighted), Company, Department, then the rest. */
export function reviewTiles(r: HiringRequest): Tile[] {
  const T = (label: string, value: string, highlight = false): Tile => ({ label, value, highlight })
  const rest = r.fields.filter(f => !['position', 'dept', 'budget', 'headcount', 'start'].includes(f.id) && f.type !== 'longtext')
  return [
    T(labelOf(r, 'budget', 'Budget (RM / month)'), budgetText(answerOf(r, 'budget')), true),
    T(labelOf(r, 'headcount', 'Headcount'), answerOf(r, 'headcount') || '—', true),
    T(labelOf(r, 'start', 'Expected start'), answerOf(r, 'start') || '—', true),
    T('Company', r.requesterCompany || 'HOUZS Venture'),
    T(labelOf(r, 'dept', 'Department'), answerOf(r, 'dept') || '—'),
    ...rest.map(f => T(f.label, fieldValue(r, f))),
  ]
}

/** A request page's Requirements: every short answer (Position aside), the three it is about first. */
export function pageTiles(r: HiringRequest): Tile[] {
  const tiles = r.fields
    .filter(f => f.id !== 'position' && f.type !== 'longtext')
    .map(f => ({ label: f.label, value: fieldValue(r, f), highlight: HIGHLIGHT.includes(f.id) }))
    .sort((a, b) => Number(b.highlight) - Number(a.highlight))
  const extra: Tile[] = []
  if (r.attachmentName) extra.push({ label: 'Attachment', value: r.attachmentName, highlight: false })
  if (r.status === 'filled') {
    extra.push({ label: 'Hired through', value: r.hiredThrough || '—', highlight: false })
    extra.push({ label: 'Hiring cost', value: r.hiringCost ? costText(r.hiringCost) : '—', highlight: false })
  }
  return [...tiles, ...extra]
}

/** The long answers (Job description, Special notes). */
export function longTexts(r: HiringRequest): Array<{ label: string; value: string }> {
  return r.fields.filter(f => f.type === 'longtext').map(f => ({ label: f.label, value: answerOf(r, f.id) || '—' }))
}

export interface TrailRow {
  what: string
  when: string
  who: string
  note: string
  major: boolean
  /** The newest step: an orange dot and no line below it. */
  last: boolean
}

/** The Audit trail, oldest first; "Status only" keeps the major steps. */
export function trailRows(events: readonly HiringEvent[], majorOnly = false): TrailRow[] {
  const rows = events.filter(e => !majorOnly || MAJOR_EVENTS.has(e.what))
  return rows.map((e, i) => ({ what: e.what, when: dayLabel(e.at), who: e.who, note: e.note, major: MAJOR_EVENTS.has(e.what), last: i === rows.length - 1 }))
}

/** "2 · 1 appt · 1 out" — candidates, those past an appointment, those not selected. */
export function candidateMix(r: Pick<HiringRequest, 'candidates'>): { count: string; meta: string } {
  const cs = r.candidates
  const ap = cs.filter(c => c.stage === 'appointment' || c.stage === 'offered' || c.stage === 'hired').length
  const out = cs.filter(c => c.stage === 'rejected').length
  return { count: String(cs.length), meta: (ap ? ' · ' + ap + ' appt' : '') + (out ? ' · ' + out + ' out' : '') }
}

export type ListingFilter = 'all' | 'submitted' | 'acknowledged' | 'filled' | 'cancelled'
export const LISTING_STATS: ReadonlyArray<{ key: ListingFilter; label: string }> = [
  { key: 'all', label: 'Total' },
  { key: 'submitted', label: 'Pending' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'filled', label: 'Filled' },
  { key: 'cancelled', label: 'Cancelled' },
]
export function listingCount(requests: readonly HiringRequest[], k: ListingFilter): number {
  return requests.filter(r => k === 'all' || r.status === k).length
}

export type ReviewFilter = 'pending' | 'info' | 'declined'
const REVIEW_STATUSES: Readonly<Record<ReviewFilter, readonly HiringStatus[]>> = {
  pending: ['submitted'],
  info: ['needs_info'],
  declined: ['declined'],
}
export const REVIEW_FILTERS: ReadonlyArray<{ key: ReviewFilter; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'info', label: 'Info requested' },
  { key: 'declined', label: 'Declined' },
]
export function inReview(r: HiringRequest, f: ReviewFilter): boolean {
  return REVIEW_STATUSES[f].includes(r.status)
}

/** The 3×2 pipeline: how far this request's candidates have come. */
export function pipeline(r: Pick<HiringRequest, 'candidates'>): Array<{ label: string; value: string; tone: 'ink' | 'alert' | 'ledger' | 'danger' }> {
  const cs = r.candidates
  const n = (stages: CandidateStage[]) => String(cs.filter(c => stages.includes(c.stage)).length)
  return [
    { label: 'Candidates', value: String(cs.length), tone: 'ink' },
    { label: 'Shortlisted', value: n(['shortlisted']), tone: 'ink' },
    { label: 'Done appointment', value: n(['appointment', 'offered', 'hired']), tone: 'alert' },
    { label: 'Offered', value: n(['offered']), tone: 'ink' },
    { label: 'Hired', value: n(['hired']), tone: 'ledger' },
    { label: 'Not selected', value: n(['rejected']), tone: 'danger' },
  ]
}

/** One "Hired" pick per headcount, from this request's candidates who are still in it. */
export function hiredChoices(r: HiringRequest): { slots: number; names: string[] } {
  return { slots: Math.max(1, headcountOf(r)), names: r.candidates.filter(c => c.stage !== 'rejected').map(c => c.name) }
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

const dateLabel = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? officeDay(v).format('D MMM YYYY') : v)

/** A candidate's details as the pills under their name: "Expected salary RM 3,000", "Available from 1 Nov 2026". */
export function candidateInfo(c: HiringCandidate, fields: readonly CandidateField[]): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = []
  for (const f of fields) {
    const v = c.answers[f.id]
    if (!v) continue
    const money = f.type === 'number' && /salary|rm/i.test(f.label)
    out.push({
      label: f.label.replace(/\s*\(RM\)/, ''),
      value: money ? 'RM ' + Number(v).toLocaleString('en-US') : f.type === 'date' ? dateLabel(v) : v,
    })
  }
  return out
}

/** "Applied · 016-221 0457" — where the candidate came from, and how to reach them. */
export function candidateMeta(c: HiringCandidate): string {
  return [c.source, c.phone].filter(Boolean).join(' · ')
}

/** Talent Bank people not already in this request (a not-selected one may come back), matching ones first. */
export function pickRows(board: Pick<HiringBoard, 'talents'>, r: HiringRequest): Array<{ talent: HiringTalent; match: boolean; note: string }> {
  const pos = answerOf(r, 'position').toLowerCase()
  return board.talents
    .filter(t => !r.candidates.some(c => c.talentId === t.id && c.stage !== 'rejected'))
    .map(t => ({ talent: t, note: t.notes.split('\n')[0], match: !!pos && (t.position.toLowerCase() === pos || pos.includes(t.position.toLowerCase())) }))
    .sort((a, b) => Number(b.match) - Number(a.match))
}

/** Where a talent stands: interviewing for an open request, else available. */
export function talentStatus(board: Pick<HiringBoard, 'requests'>, t: HiringTalent): { label: string; tone: ChipTone; request: string | null } {
  const live = board.requests.find(r => OPEN.has(r.status) && r.candidates.some(c => c.talentId === t.id && c.stage !== 'rejected'))
  return live ? { label: 'Interviewing · ' + live.id, tone: 'alert', request: live.id } : { label: 'Available', tone: 'ledger', request: null }
}

/** The departments a request or a talent is filed under: the Department field's first part ("Revenue · Fair" → Revenue). */
export function departmentNames(board: Pick<HiringBoard, 'fields'>): string[] {
  const dept = board.fields.find(f => f.id === 'dept')
  const names = (dept?.options ?? '').split(',').map(o => o.trim().split(' · ')[0]).filter(Boolean)
  return [...new Set(names)]
}

/**
 * One request, every answer by name — what the HR phone app draws (the
 * handoff's `hv-hrdata`): the coordinator's list, 2026-10-11.
 */
export interface RequestSummary {
  id: string
  status: HiringStatus
  statusLabel: string
  position: string
  headcount: string
  department: string
  budget: string
  start: string
  employment: string
  reason: string
  age: string
  gender: string
  race: string
  jd: string
  notes: string
  ownerId: string | null
  ownerName: string
  requesterName: string
  /** A guest's company, else the requester's department. */
  requesterOrg: string
  viaGuestLink: boolean
  submitted: string
  hiredNames: string[]
  source: string
  cost: number | null
  candidates: Array<{ id: string; name: string; phone: string; note: string; source: string; stage: CandidateStage; stageLabel: string }>
  events: Array<{ what: string; when: string; who: string; note: string; major: boolean }>
}

export function requestSummary(r: HiringRequest, board: Pick<HiringBoard, 'people'>): RequestSummary {
  const a = (id: string) => answerOf(r, id)
  return {
    id: r.id,
    status: r.status,
    statusLabel: STATUS[r.status].label,
    position: a('position'),
    headcount: a('headcount'),
    department: a('dept'),
    budget: budgetText(a('budget')),
    start: a('start'),
    employment: a('emp'),
    reason: a('reason'),
    age: a('age'),
    gender: a('gender'),
    race: a('race'),
    jd: a('jd'),
    notes: a('notes'),
    ownerId: r.ownerId,
    ownerName: personName(board, r.ownerId),
    requesterName: r.requesterName,
    requesterOrg: requesterOrg(r),
    viaGuestLink: r.source === 'guest',
    submitted: dayLabel(r.submittedAt),
    hiredNames: r.hiredNames,
    source: r.hiredThrough ?? '',
    cost: r.hiringCost,
    candidates: r.candidates.map(c => ({ id: c.id, name: c.name, phone: c.phone, note: c.note, source: c.source, stage: c.stage, stageLabel: STAGE[c.stage].label })),
    events: r.events.map(e => ({ what: e.what, when: dayLabel(e.at), who: e.who, note: e.note, major: MAJOR_EVENTS.has(e.what) })),
  }
}

/** The active sources, by name (Hired through). */
export function activeSources(board: Pick<HiringBoard, 'sources'>): string[] {
  return board.sources.filter(s => s.active).map(s => s.name)
}

/** Answers a requester left blank that the form requires — the handoff's "Fill in X, Y." */
export function missingAnswers(fields: readonly HiringField[], answers: Record<string, string>): string[] {
  return fields.filter(f => f.required && !String(answers[f.id] ?? '').replace('–', '').trim()).map(f => f.label)
}
