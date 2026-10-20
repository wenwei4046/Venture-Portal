import { dayMon, firstOfMonth, policyOn, shortDay } from '@/lib/attendance/engine'
import { atLabel, manpowerTitle, rangeLabel, whenLabel } from '@/lib/attendance/requests'
import type { AttLeaveType, AttPerson, AttRequest, AttRoute, Route } from '@/lib/attendance/types'
import { fmtN, plural } from './format'
import type { MeData } from './types'

/**
 * Me's requests in the handoff's words (2026-10-17, `Staff App v2.dc.html` — its reqs, statusOf, stepVis and the
 * sheets' route lines): what each request is called, when, how much, its chip, its audit trail, and who decides.
 * Pure.
 */

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

/** Waiting · Approved · Rejected · Cancelled. */
export function meStatus(r: Pick<AttRequest, 'status'>): [Tone, string] {
  if (r.status === 'pending') return ['warning', 'Waiting']
  if (r.status === 'approved') return ['success', 'Approved']
  if (r.status === 'rejected') return ['danger', 'Rejected']
  return ['neutral', 'Cancelled']
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** What Me › Profile calls each field of the record a change names. */
export const PROFILE_LABELS: Readonly<Record<string, string>> = {
  contact_number: 'Mobile',
  email: 'Personal email',
  address: 'Home address',
  // The home address in its six parts (2026-10-20).
  address_line1: 'Address line 1',
  address_line2: 'Address line 2',
  address_postcode: 'Postcode',
  address_city: 'City',
  address_state: 'State',
  address_country: 'Country',
  emergency_contact_name: 'Emergency contact',
  emergency_contact_relationship: 'Relationship',
  emergency_contact_phone: 'Emergency mobile',
  bank_name: 'Bank',
  bank_account_no: 'Account number',
}

export interface Change {
  key: string
  label: string
  from: string
  to: string
}

/** A profile change's fields, in Me's words (the account number arrives masked: "•••• 3376"). */
export function changesOf(r: Pick<AttRequest, 'detail'>): Change[] {
  const list = Array.isArray(r.detail.changes) ? (r.detail.changes as Array<Record<string, unknown>>) : []
  return list.map(c => ({ key: str(c.key), label: PROFILE_LABELS[str(c.key)] ?? str(c.field), from: str(c.from) || '—', to: str(c.to) || '—' }))
}

/** "Annual leave", "Overtime", "Overtime · after the fact", "Correction · OUT", "Extra manpower · 2 promoters", "Profile change". */
export function requestTitle(r: AttRequest, leaveTypes: readonly AttLeaveType[]): string {
  if (r.kind === 'leave') return leaveTypes.find(t => t.code === r.leaveCode)?.name ?? `${r.leaveCode ?? ''} leave`.trim()
  if (r.kind === 'ot') return r.detail.after === true ? 'Overtime · after the fact' : 'Overtime'
  if (r.kind === 'correction') return `Correction${str(r.detail.punch) ? ` · ${str(r.detail.punch).toUpperCase()}` : ''}`
  if (r.kind === 'manpower') return manpowerTitle(r.detail)
  return 'Profile change'
}

/** "Thu 22 – Fri 23 Oct", "Wed 14 Oct · morning", "Tue 6 Oct · 18:04", "Mid Valley Home Fair · Sat 24 – Sun 25 Oct". */
export function requestWhen(r: AttRequest): string {
  if (r.kind === 'profile') return changesOf(r).map(c => c.label).join(' · ') || '—'
  if (!r.from) return '—'
  if (r.kind === 'leave') {
    const half = str(r.detail.half)
    return (!r.to || r.to === r.from) && half ? `${shortDay(r.from)} · ${half.toLowerCase()}` : rangeLabel(r.from, r.to)
  }
  if (r.kind === 'ot') return shortDay(r.from)
  return whenLabel(r)
}

/** A correction's place in its month's quota: the ones that count, up to this one. */
export function correctionNth(r: AttRequest, mine: readonly AttRequest[]): number | null {
  if (r.kind !== 'correction' || !r.from || (r.status !== 'pending' && r.status !== 'approved')) return null
  const month = r.from.slice(0, 7)
  return mine.filter(x => x.kind === 'correction' && (x.status === 'pending' || x.status === 'approved') && x.from?.slice(0, 7) === month && x.sentAt <= r.sentAt).length
}

/** The corrections a month allows (the policy in force on its first day). */
export const quotaFor = (d: Pick<MeData, 'policies'>, day: string) => policyOn(firstOfMonth(day), d.policies)?.correctionsPerMonth ?? 0

/** "2 days", "2 h", "2 of 3 this month", "4 person-days", "3 fields". */
export function requestAmount(r: AttRequest, d: Pick<MeData, 'policies' | 'requests'>, nth: number | null = correctionNth(r, d.requests)): string {
  if (r.kind === 'leave') return r.days != null ? plural(Number(r.days), 'day') : '—'
  if (r.kind === 'ot') return r.hours != null ? `${fmtN(Number(r.hours))} h` : '—'
  if (r.kind === 'correction') return nth != null && r.from ? `${nth} of ${quotaFor(d, r.from)} this month` : '—'
  if (r.kind === 'manpower') {
    if (!r.from) return '—'
    const days = Math.round((Date.parse(r.to ?? r.from) - Date.parse(r.from)) / 86400000) + 1
    return `${days * (Number(r.detail.count) || 0)} person-days`
  }
  const n = changesOf(r).length
  return `${n} field${n === 1 ? '' : 's'}`
}

/** The request sheet's facts: a profile change's fields (from → to), else Amount · Sent · Reason. */
export function requestFacts(r: AttRequest, d: Pick<MeData, 'policies' | 'requests'>): Array<{ label: string; value: string }> {
  const sent = atLabel(r.sentAt)
  if (r.kind === 'profile') return [...changesOf(r).map(c => ({ label: c.label, value: `${c.from} → ${c.to}` })), { label: 'Sent', value: sent }]
  return [
    { label: 'Amount', value: requestAmount(r, d) },
    { label: 'Sent', value: sent },
    { label: 'Reason', value: r.reason || '—' },
    ...(r.attachment ? [{ label: 'File', value: r.attachment }] : []),
  ]
}

export type TrailState = 'sent' | 'approved' | 'waiting' | 'rejected' | 'queued' | 'skipped'

export interface TrailStep {
  role: string
  who: string
  state: TrailState
  at: string
}

/** You · Sent, then each step: ✓ approved · ● waiting · × rejected · · next / skipped. */
export function trailOf(r: AttRequest, myName: string): TrailStep[] {
  const out: TrailStep[] = [r.onBehalf ? { role: 'HR', who: r.by, state: 'sent', at: atLabel(r.sentAt) } : { role: 'You', who: myName, state: 'sent', at: atLabel(r.sentAt) }]
  r.steps.forEach((s, i) => {
    const role = s.role === 'hr' ? 'HR' : 'Upline'
    const decided = s.state === 'approved' || s.state === 'rejected'
    const who = decided
      ? s.role === 'hr' ? s.decidedBy ?? s.approver : s.onBehalf ? `${s.decidedBy ?? 'HR'} for ${s.approver}` : s.approver
      : s.approver
    const at = decided
      ? `${atLabel(s.decidedAt)}${s.note ? ` · “${s.note}”` : ''}`
      : s.state === 'waiting' ? `Arrived ${atLabel(s.arrivedAt)}`
      : s.state === 'queued' ? `After ${i > 0 ? (r.steps[i - 1].role === 'hr' ? 'HR' : 'upline') : 'upline'}`
      : r.status === 'cancelled' ? `Cancelled by you · ${atLabel(r.decidedAt)}` : 'Ended by the rejection'
    out.push({ role, who, state: s.state, at })
  })
  return out
}

// ── Who decides ─────────────────────────────────────────────────────────────

/** The route a kind takes for this person — att_route_for's order: their title's route, the company's, the leave type's, the default. */
export function routeFor(kind: string, d: Pick<MeData, 'routes' | 'leaveTypes' | 'me'>): Route {
  const title = d.me?.titleId ?? null
  const hits = (r: AttRoute) => r.kinds.includes(kind) || r.kinds.includes('*')
  const byTitle = d.routes.find(r => r.scope === 'title' && r.titleId === title && hits(r))
  if (byTitle) return byTitle.route
  const company = d.routes.find(r => r.scope === 'company' && hits(r))
  if (company) return company.route
  const type = d.leaveTypes.find(t => t.code === kind)
  if (type) return type.route
  return kind === 'OT' || kind === 'MP' ? 'upline_then_hr' : kind === 'PF' ? 'hr_only' : 'upline_only'
}

/** Who actually decides: an upline step only for an upline with a login of their own (att_create_request). */
export function deciders(route: Route, me: AttPerson | null): { upline: string | null; hr: boolean } {
  const up = me?.upline && me.uplineHasLogin ? me.upline : null
  const upline = route !== 'hr_only' ? up : null
  return { upline, hr: route !== 'upline_only' || !upline }
}

/** Apply for leave's route line. */
export function leaveRouteLine(route: Route, me: AttPerson | null, certificate: boolean): string {
  const { upline, hr } = deciders(route, me)
  const told = me?.upline ? ` ${me.upline} is told.` : ''
  if (upline && !hr) return `${upline} (your upline) decides. HR sees it.`
  if (upline && hr) return `${upline}, then HR.`
  return certificate ? `HR decides — they check the certificate.${told}` : `HR decides.${told}`
}

/** Overtime's and Extra manpower's "Goes to …" line. */
export function goesTo(route: Route, me: AttPerson | null, then = ''): string {
  const { upline, hr } = deciders(route, me)
  if (upline && hr) return `Goes to ${upline} (upline), then HR${then}.`
  if (upline) return `Goes to ${upline} (upline).`
  return `Goes to HR${then}.`
}

/** Correct a punch's line: the upline knows whether you were there. */
export function correctionLine(route: Route, me: AttPerson | null): string {
  const { upline, hr } = deciders(route, me)
  if (upline && !hr) return `${upline} (upline) decides — they know whether you were there.`
  if (upline) return `${upline} (upline), then HR — they know whether you were there.`
  return 'HR decides.'
}

/** Submit request's list: "upline, then HR" · "upline decides" · "HR decides". */
export function routeShort(route: Route, me: AttPerson | null): string {
  const { upline, hr } = deciders(route, me)
  return upline && hr ? 'upline, then HR' : upline ? 'upline decides' : 'HR decides'
}

/** The leave history's month groups: by the month a request was sent (its reference's YYMM), newest first. */
export function monthOfRef(r: Pick<AttRequest, 'ref' | 'sentAt'>): string {
  const m = /-(\d{2})(\d{2})-/.exec(r.ref)
  return m ? `20${m[1]}-${m[2]}-01` : `${r.sentAt.slice(0, 7)}-01`
}

/** "12 Oct" — a day the trail or a banner names. */
export const dayLabel = dayMon
