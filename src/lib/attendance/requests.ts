import { sees, shown, type SensitiveHolder } from '@/lib/sensitive'
import { dayMon, monAbbr, shortDay, wd3 } from './engine'
import type { AttLeaveType, AttRequest, AttStep, Route } from './types'

/**
 * Attendance › Requests, the words and buckets (2026-10-15, the handoff's
 * `isRequests` and its `stateOf` / `dNodes`): which list a request sits in,
 * its status chip, how its kind, dates, amount and waiting time read, and the
 * approval flow's nodes. Pure.
 */

export type Bucket = 'hr' | 'upline' | 'decided'

export const waitingStep = (r: AttRequest): AttStep | null => (r.status === 'pending' ? r.steps.find(s => s.state === 'waiting') ?? null : null)

/** Pending (waiting for HR) · At upline · Decided. */
export function bucketOf(r: AttRequest): Bucket {
  const w = waitingStep(r)
  if (!w) return 'decided'
  return w.role === 'hr' ? 'hr' : 'upline'
}

export type ChipTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

export function statusOf(r: AttRequest): [ChipTone, string] {
  const w = waitingStep(r)
  if (w) return ['warning', `Waiting · ${w.role === 'hr' ? 'HR' : 'Upline'}`]
  if (r.status === 'rejected') return ['danger', 'Rejected']
  if (r.status === 'cancelled') return ['neutral', 'Withdrawn']
  return ['success', 'Approved']
}

export const ROUTE_WORDS: Readonly<Record<Route, string>> = { upline_only: 'Upline only', hr_only: 'HR only', upline_then_hr: 'Upline → HR' }

const DAY_TYPE: Readonly<Record<string, string>> = { work: 'work day', off: 'off day', rest: 'rest day', ph: 'public holiday' }

const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** "Sick leave", "Overtime · asked first", "Correction · OUT", "Profile change". */
export function kindLabel(r: AttRequest, leaveTypes: readonly AttLeaveType[]): string {
  if (r.kind === 'leave') return leaveTypes.find(t => t.code === r.leaveCode)?.name ?? `${r.leaveCode ?? ''} leave`.trim()
  if (r.kind === 'ot') return 'Overtime · asked first'
  if (r.kind === 'correction') return `Correction${str(r.detail.punch) ? ` · ${str(r.detail.punch).toUpperCase()}` : ''}`
  if (r.kind === 'manpower') return manpowerTitle(r.detail)
  return 'Profile change'
}

/** "Extra manpower · 2 promoters" (Me › Submit request's own words). */
export function manpowerTitle(detail: Record<string, unknown>): string {
  const n = Number(detail.count) || 0
  const role = str(detail.role).toLowerCase()
  return role && n ? `Extra manpower · ${n} ${role}${n === 1 ? '' : 's'}` : 'Extra manpower'
}

/** Calendar days from a to b, inclusive (a fair's days). */
const calendarDays = (from: string, to: string | null) => Math.max(1, Math.round((Date.parse(to ?? from) - Date.parse(from)) / 86400000) + 1)

/** "Mon 12 Oct", "Thu 22 – Fri 23 Oct", "Fri 30 Oct – Mon 2 Nov". */
export function rangeLabel(from: string, to: string | null): string {
  if (!to || to === from) return shortDay(from)
  if (from.slice(0, 7) === to.slice(0, 7)) return `${wd3(from)} ${Number(from.slice(8))} – ${shortDay(to)}`
  return `${shortDay(from)} – ${shortDay(to)}`
}

/** When: the dates, the OT's hours or day type, the correction's time, the profile's fields. */
export function whenLabel(r: AttRequest): string {
  if (r.kind === 'profile') {
    const changes = Array.isArray(r.detail.changes) ? (r.detail.changes as Array<{ field?: unknown }>) : []
    return changes.map(c => str(c.field)).filter(Boolean).join(' · ') || '—'
  }
  if (!r.from) return '—'
  if (r.kind === 'ot') {
    const from = str(r.detail.from), to = str(r.detail.to), dt = str(r.detail.dayType)
    return `${shortDay(r.from)} · ${from && to ? `${from}–${to}` : DAY_TYPE[dt] ?? 'overtime'}`
  }
  if (r.kind === 'correction') return `${shortDay(r.from)}${str(r.detail.at) ? ` · ${str(r.detail.at)}` : ''}`
  if (r.kind === 'manpower') return `${str(r.detail.for) ? `${str(r.detail.for)} · ` : ''}${rangeLabel(r.from, r.to)}`
  return rangeLabel(r.from, r.to)
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
const num = (n: number) => String(Math.round(n * 100) / 100)

/**
 * What the page says once a request is decided: a profile change counts its fields as the record does — "1 field",
 * "3 fields" (it said "1 fields", found 2026-10-16 approving a Request to change email).
 */
export function decidedToast(r: AttRequest, approve: boolean): string {
  if (r.kind === 'profile') return approve ? `Approved · ${r.who}'s record updated · ${amountLabel(r)}` : `Rejected · record unchanged · ${r.who} told`
  return `${approve ? 'Approved' : 'Rejected'} · ${r.who} told`
}

/** "1 day", "6 h", "3 fields". */
export function amountLabel(r: AttRequest): string {
  if (r.kind === 'leave') return r.days != null ? `${num(r.days)} day${Number(r.days) === 1 ? '' : 's'}` : '—'
  if (r.kind === 'ot') return r.hours != null ? `${num(r.hours)} h` : '—'
  if (r.kind === 'profile') {
    const n = Array.isArray(r.detail.changes) ? r.detail.changes.length : 0
    return plural(n, 'field')
  }
  if (r.kind === 'manpower' && r.from) return `${calendarDays(r.from, r.to) * (Number(r.detail.count) || 0)} person-days`
  return '—'
}

/** How long it has waited where it waits: "49 m", "20 h", "2 d"; '' once decided. */
export function sinceLabel(r: AttRequest, now: Date): string {
  const w = waitingStep(r)
  if (!w) return ''
  const at = Date.parse(w.arrivedAt ?? r.sentAt)
  if (Number.isNaN(at)) return ''
  const min = Math.max(0, Math.floor((now.getTime() - at) / 60000))
  if (min < 60) return `${min} m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h`
  return `${Math.floor(h / 24)} d`
}

const OFFICE = 'Asia/Kuala_Lumpur'

/** "12 Oct, 08:20" in the office's clock. */
export function atLabel(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: OFFICE, day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d)
    .reduce<Record<string, string>>((a, x) => ({ ...a, [x.type]: x.value }), {})
  const isoDay = `${p.year}-${p.month.padStart(2, '0')}-${p.day.padStart(2, '0')}`
  return `${dayMon(isoDay)}, ${p.hour}:${p.minute}`
}

/** The office date of an instant ('YYYY-MM-DD'). */
export function officeDateOf(iso: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: OFFICE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  return p
}

export interface FlowNode {
  role: string
  who: string
  label: string
  at: string
  state: 'done' | 'current' | 'next' | 'rejected'
  stateFg: string
}

const STEP_LABEL: Readonly<Record<string, string>> = { approved: 'Approved', waiting: 'Waiting', rejected: 'Rejected', queued: 'Next', skipped: 'Skipped' }

/** Submitted, then each step: green when approved, the accent ring while waiting, grey next, red rejected. */
export function flowNodes(r: AttRequest): FlowNode[] {
  const nodes: FlowNode[] = [{ role: 'Submitted', who: r.onBehalf ? `${r.who} · by ${r.by}` : r.who, label: 'Sent', at: '', state: 'done', stateFg: 'var(--ds-success)' }]
  for (const s of r.steps) {
    const ok = s.state === 'approved', w = s.state === 'waiting', bad = s.state === 'rejected'
    const who = ok || bad
      ? `${s.role === 'hr' ? s.decidedBy ?? s.approver : s.approver}${s.onBehalf ? ` · by ${s.decidedBy ?? 'HR'} on behalf` : ''}`
      : s.approver
    nodes.push({
      role: s.role === 'hr' ? 'HR' : 'Upline',
      who,
      label: STEP_LABEL[s.state] ?? s.state,
      at: ok || bad ? atLabel(s.decidedAt) : w ? `Arrived ${atLabel(s.arrivedAt)}` : s.state === 'queued' ? 'After the upline' : 'Ended by the rejection',
      state: ok ? 'done' : bad ? 'rejected' : w ? 'current' : 'next',
      stateFg: ok ? 'var(--ds-success)' : bad ? 'var(--ds-danger)' : w ? 'rgb(var(--tone-clay-deep))' : 'var(--ds-ink-3)',
    })
  }
  return nodes
}

/** "Oct" for a date — the month part of a reference. */
export const monOf = (iso: string) => monAbbr(iso)

/**
 * A profile change's account number as this viewer may see it (2026-10-15): the database already shows •••• to an
 * account whose title does not tick bank accounts; this is the same answer for the Principal's view-as switch, which
 * the database cannot see (lib/sensitive.ts).
 */
export function shownChanges(r: AttRequest, viewer: SensitiveHolder): AttRequest {
  if (r.kind !== 'profile' || !Array.isArray(r.detail.changes) || sees(viewer, 'bank')) return r
  const str = (v: unknown) => (typeof v === 'string' ? v : null)
  const changes = (r.detail.changes as Array<Record<string, unknown>>).map(c =>
    c.key === 'bank_account_no' ? { ...c, from: shown(viewer, 'bank', str(c.from)), to: shown(viewer, 'bank', str(c.to)) } : c)
  return { ...r, detail: { ...r.detail, changes } }
}
