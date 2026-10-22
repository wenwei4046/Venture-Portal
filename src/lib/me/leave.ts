import { balanceOf, entitlement, leaveDaysFor, type Balance } from '@/lib/attendance/engine'
import type { AttLeaveType, AttRequest } from '@/lib/attendance/types'
import { fmtN } from './format'
import { configOf } from './month'
import { leaveRouteLine, monthOfRef, routeFor, routeShort } from './requests'
import type { MeData } from './types'

/**
 * Me › Leave (2026-10-17, the handoff's `isLeave`, `lvPanels`, the Apply sheet and Leave history): one tab and one
 * balance card per leave type, the checks a request passes as it is filled, and the history by month. Balances come
 * from the engine HR's Leave balances use (`balanceOf`). Pure.
 */

/**
 * What the handoff's TYPES say of each leave by its code — days of notice, days it may be sent after, a certificate
 * to attach, half days. Leave types carry none of these yet (HR › Settings sets the entitlement, the route, how days
 * count); a code not listed takes no notice, no back-dating, no certificate, and half days.
 */
export const LEAVE_RULES: Readonly<Record<string, { notice: number; back: number; certificate: boolean; half: boolean }>> = {
  AL: { notice: 3, back: 0, certificate: false, half: true },
  SL: { notice: 0, back: 2, certificate: true, half: true },
  HL: { notice: 0, back: 2, certificate: true, half: false },
  CL: { notice: 0, back: 2, certificate: false, half: false },
  MR: { notice: 14, back: 0, certificate: false, half: false },
  RL: { notice: 1, back: 0, certificate: false, half: true },
  EL: { notice: 0, back: 1, certificate: false, half: true },
  UL: { notice: 3, back: 0, certificate: false, half: true },
}
export const rulesOf = (code: string) => LEAVE_RULES[code] ?? { notice: 0, back: 0, certificate: false, half: true }

/** The furthest back the calendar opens: the most days any type may be sent after. */
export const BACK_DAYS = Math.max(...Object.values(LEAVE_RULES).map(r => r.back))

/** The ledger card colours, one per tab, in order (the handoff's LEDGER; `globals.css` › `--me-ledger-*`): the last is cream with ink lettering. */
export const LEDGER: ReadonlyArray<{ bg: string; light: boolean }> = [1, 2, 3, 4, 5, 6, 7].map(i => ({ bg: `var(--me-ledger-${i})`, light: i === 7 }))

/** A tab's word: "Annual leave" → "Annual". */
export const tabWord = (t: AttLeaveType) => t.name.replace(/\s+leave$/i, '') || t.code

/** The types with a balance of their own (one taken from another's — Emergency from Annual — is not a tab). */
export const tabTypes = (d: MeData) => d.leaveTypes.filter(t => !t.drawsFrom)

export interface Panel {
  code: string
  name: string
  pos: string
  left: string
  unit: string
  pct: number
  facts: Array<{ label: string; value: string }>
  note: string
}

/** One's balance of a type, this year. */
export function balance(d: MeData, type: AttLeaveType): Balance | null {
  if (!d.me) return null
  return balanceOf(d.me, type, configOf(d), d.ledger, d.workDay)
}

export function panels(d: MeData): Panel[] {
  const list = tabTypes(d)
  return list.map((t, i) => {
    const b = balance(d, t)
    const unpaid = t.unpaid
    const of = unpaid ? null : b?.of ?? null
    const left = unpaid ? null : b?.left ?? null
    const used = b?.used ?? 0
    const pend = b?.pending ?? 0
    const yearly = d.me && !unpaid ? entitlement(d.me, t, d.workDay) : null
    const entLabel = unpaid ? 'Limit' : t.accrues || (!yearly && (b?.of ?? 0) > 0) ? 'Earned' : 'A year'
    const entValue = unpaid ? 'None' : of == null ? '—' : fmtN(t.accrues ? Number(b?.earned ?? 0) + Number(b?.opening ?? 0) : of)
    const accrual = t.accrues && yearly ? `Earned ${fmtN(Math.round((yearly / 12) * 100) / 100)} a month, ${fmtN(yearly)} for the year` : ''
    const carried = b?.opening ? `${fmtN(b.opening)} carried from ${Number(d.workDay.slice(0, 4)) - 1}` : ''
    const note = unpaid
      ? ['No balance · each day is deducted from pay', routeShort(routeFor(t.code, d), d.me)].join(' · ')
      : [accrual, carried, t.rules.trim()].filter(Boolean).join(' · ') || (b && !b.covered ? 'Not given to your title' : '')
    return {
      code: t.code,
      name: t.name,
      pos: `${i + 1} / ${list.length}`,
      left: left == null ? '—' : fmtN(left),
      unit: left == null ? '' : left === 1 ? 'day' : 'days',
      pct: of ? Math.max(0, Math.min(100, ((used + pend) / of) * 100)) : 0,
      facts: [{ label: entLabel, value: entValue }, { label: 'Used', value: fmtN(used) }, { label: 'Pending', value: fmtN(pend) }],
      note,
    }
  })
}

/** Maternity and paternity, and whatever is taken from another type's balance. */
export function footnote(d: MeData): string {
  const has = (re: RegExp) => d.leaveTypes.some(t => re.test(t.name))
  const parts = has(/maternity|paternity/i) ? [] : ['Maternity and paternity leave: ask HR.']
  for (const t of d.leaveTypes.filter(x => x.drawsFrom)) {
    const src = d.leaveTypes.find(x => x.code === t.drawsFrom)
    if (src) parts.push(`${t.name} is taken from your ${src.name.toLowerCase()}.`)
  }
  return parts.join(' ')
}

// ── Apply for leave ─────────────────────────────────────────────────────────

/** The days a request takes: the schedule's work days less holidays (or every day, for a type counted in calendar days) — `leaveDaysFor`, as HR counts them. */
export function leaveDays(d: MeData, code: string, from: string, to: string): number {
  if (!d.me || to < from) return -1
  return leaveDaysFor(d.me, from, to, d, { calendar: d.leaveTypes.find(t => t.code === code)?.counts === 'calendar' })
}

export interface LeaveForm {
  code: string
  from: string
  to: string
  half: 'Full day' | 'Morning' | 'Afternoon'
  reason: string
  file: { name: string } | null
}

export interface LeaveCheck {
  days: number
  error: string
  /** "3 days left before this · 1 after", or the unpaid line. */
  balanceLine: string
  route: string
  certificate: boolean
  halfOk: boolean
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)

/** The Apply sheet as it is filled: the days it takes, the first thing in the way, the balance and the route. */
export function checkLeave(d: MeData, f: LeaveForm): LeaveCheck {
  const type = d.leaveTypes.find(t => t.code === f.code)
  const rules = rulesOf(f.code)
  const name = type?.name ?? f.code
  const to = f.to || f.from
  const same = !!f.from && f.from === to
  let days = f.from ? leaveDays(d, f.code, f.from, to) : 0
  if (days > 0 && same && rules.half && f.half !== 'Full day') days = 0.5
  const src = type?.drawsFrom ? d.leaveTypes.find(t => t.code === type.drawsFrom) ?? type : type
  const b = src ? balance(d, src) : null
  const unpaid = !!src?.unpaid
  const bal = unpaid ? null : b?.left ?? null
  const diff = f.from ? daysBetween(d.workDay, f.from) : 0
  let error = ''
  if (!f.from) error = 'Tap your first and last day on the calendar.'
  else if (days < 0) error = 'The end date is before the start.'
  else if (days === 0) error = 'No working days in these dates.'
  else if (rules.notice && diff < rules.notice) error = `${name} needs ${rules.notice} days' notice.`
  else if (diff < -rules.back) error = rules.back ? `${name} can be sent up to ${rules.back} days after.` : 'This date has passed.'
  else if (!unpaid && b && !b.covered) error = `${name} is not given to your title.`
  else if (bal !== null && days > bal) error = `Only ${fmtN(bal)} days left.`
  else if (rules.certificate && !f.file) error = 'Add the medical certificate to send.'
  return {
    days,
    error,
    balanceLine: bal === null ? 'Unpaid · goes to payroll as unpaid days' : `${fmtN(bal)} days left before this · ${fmtN(Math.max(0, bal - Math.max(0, days)))} after`,
    route: leaveRouteLine(routeFor(f.code, d), d.me, rules.certificate),
    certificate: rules.certificate,
    halfOk: same && rules.half,
  }
}

/** The Apply sheet's type list: every type, one taken from another's named so ("Emergency leave · from AL"). */
export const typeOptions = (d: MeData) =>
  d.leaveTypes.map(t => ({ value: t.code, label: t.drawsFrom ? `${t.name} · from ${t.drawsFrom}` : t.name }))

// ── History ─────────────────────────────────────────────────────────────────

export type Filter = 'All' | 'Waiting' | 'Decided'

export const filtered = (list: readonly AttRequest[], f: Filter) =>
  list.filter(r => f === 'All' || (f === 'Waiting' ? r.status === 'pending' : r.status !== 'pending'))

/** Leave history's groups: by the month sent, each with the days it holds (rejected and cancelled not counted). */
export function historyGroups(d: MeData, f: Filter): Array<{ month: string; total: number; rows: AttRequest[] }> {
  const groups: Array<{ month: string; total: number; rows: AttRequest[] }> = []
  for (const r of filtered(d.requests.filter(x => x.kind === 'leave'), f)) {
    const month = monthOfRef(r)
    let g = groups.find(x => x.month === month)
    if (!g) groups.push((g = { month, total: 0, rows: [] }))
    g.rows.push(r)
    if (r.status !== 'rejected' && r.status !== 'cancelled') g.total += Number(r.days ?? 0)
  }
  return groups
}
