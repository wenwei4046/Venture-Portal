import { addDays, dayMon, firstOfMonth, monthLabel, monthName, shortDay } from './engine'
import type { AttRequest } from './types'

/**
 * Month close (2026-10-15, the Attendance handoff's `isClose`): which month
 * is being closed, when it is due, what still waits, and the words the
 * page's steps say. Pure.
 */

/** The month to close: `?m=YYYY-MM` when it names one, else the office's month. Its first day. */
export function closeMonthOf(today: string, asked?: string | null): string {
  if (asked && /^\d{4}-(0[1-9]|1[0-2])$/.test(asked)) return `${asked}-01`
  return firstOfMonth(today)
}

/** The month's last day. */
export function lastDayOf(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return addDays(next, -1)
}

/** Due by the 3rd of the next month (Employment Regulations 1957 reg 5 — before payroll on the 7th). */
export function dueBy(month: string): string {
  return addDays(lastDayOf(month), 3)
}

/** "Due by 3 Nov · before payroll on the 7th · Employment Regulations 1957 reg 5" */
export function dueLine(month: string): string {
  return `Due by ${dayMon(dueBy(month))} · before payroll on the 7th · Employment Regulations 1957 reg 5`
}

/** A request touches a month when its days (or, without days, the day it was sent) fall in it. */
export function touches(r: AttRequest, month: string): boolean {
  const from = month
  const to = lastDayOf(month)
  const sent = r.sentAt.slice(0, 10)
  const a = r.from ?? sent
  const b = r.to ?? r.from ?? sent
  return a <= to && b >= from
}

/** The requests still waiting that touch the month — the database refuses to close while there are any. */
export function waitingIn(requests: readonly AttRequest[], month: string): AttRequest[] {
  return requests.filter(r => r.status === 'pending' && touches(r, month))
}

/** Where the waiting step sits: "At HR" / "At upline". */
export function waitingAt(r: AttRequest): 'At HR' | 'At upline' {
  const w = r.steps.find(s => s.state === 'waiting')
  return w?.role === 'upline' ? 'At upline' : 'At HR'
}

const LEAVE_WORD: Record<string, string> = { AL: 'Annual leave', SL: 'Sick leave', HL: 'Hospitalisation', UL: 'Unpaid leave', EL: 'Emergency leave', CL: 'Compassionate leave', MR: 'Marriage leave', RL: 'Replacement leave', ML: 'Maternity', PL: 'Paternity' }

/** A request's kind as the lists say it ("Sick leave", "Overtime", "Correction", "Profile change"). */
export function kindLabel(r: AttRequest, leaveNames?: ReadonlyMap<string, string>): string {
  if (r.kind === 'leave') return (r.leaveCode && (leaveNames?.get(r.leaveCode) ?? LEAVE_WORD[r.leaveCode])) || 'Leave'
  if (r.kind === 'ot') return 'Overtime'
  if (r.kind === 'correction') return 'Correction'
  return 'Profile change'
}

/** When it is for ("Mon 12 Oct", "Mon 2 – Tue 3 Nov"). */
export function whenLabel(r: AttRequest): string {
  if (!r.from) return shortDay(r.sentAt.slice(0, 10))
  if (!r.to || r.to === r.from) return shortDay(r.from)
  const [a, b] = [shortDay(r.from), shortDay(r.to)]
  return r.from.slice(0, 7) === r.to.slice(0, 7) ? `${a.replace(/ [A-Z][a-z]{2}$/, '')} – ${b}` : `${a} – ${b}`
}

export type CloseNode = { label: string; done: boolean; note: string }

/** The four steps: Requests decided → Days decided → Freeze → Register + file. */
export function closeNodes(waiting: number, undecided: number, closed: boolean, closedAtLabel: string | null): CloseNode[] {
  const reqOk = waiting === 0
  const dayOk = undecided === 0
  return [
    { label: 'Requests decided', done: reqOk, note: reqOk ? 'Done' : `${waiting} waiting` },
    { label: 'Days decided', done: dayOk, note: dayOk ? 'Done' : `${undecided} to decide` },
    { label: 'Freeze', done: closed, note: closed ? closedAtLabel ?? 'Done' : 'On close' },
    { label: 'Register + file', done: closed, note: closed ? 'Ready' : 'After freeze' },
  ]
}

/** The Close button's words. */
export function closeLabel(month: string, closed: boolean, left: number): string {
  const name = monthLabel(month)
  if (closed) return `${monthName(month)} closed`
  return left > 0 ? `Close ${name} · ${left} to clear` : `Close ${name}`
}

/** "Fri 9 Oct · absent · no punch, no leave" / "Mon 12 Oct · incomplete · IN 08:55, no OUT" */
export function dayLine(day: string, code: 'A' | 'I', inTime: string | null): string {
  return code === 'A' ? `${shortDay(day)} · absent · no punch, no leave` : `${shortDay(day)} · incomplete · IN ${inTime ?? '—'}, no OUT`
}

/** The close's toast: the freeze, then what payroll took (lib/attendance/payroll-write.ts `sendToPayroll`). */
export function closedWords(month: string, people: number, p: { allowed: boolean; written: number; left: readonly unknown[]; failed?: boolean }): string {
  const head = `${monthLabel(month)} closed · ${people} ${people === 1 ? 'person' : 'people'} frozen`
  if (!p.allowed) return `${head} · payroll not updated`
  if (p.failed) return `${head} · payroll not reached — close again`
  return `${head} · ${p.written} sent to payroll${p.left.length ? ` · ${p.left.length} not sent` : ''}`
}

/** Outputs › Payroll's status once closed: "12 in payroll · 2 not sent", "All 12 in payroll". */
export function payrollLine(marks: ReadonlyArray<{ mark: string }>): string {
  const inPay = marks.filter(m => m.mark === 'in').length
  const out = marks.length - inPay
  if (!marks.length) return 'Nobody on HQ payroll'
  return out ? `${inPay} in payroll · ${out} not sent` : `All ${inPay} in payroll`
}

/** The register as a CSV (the frozen one, or as reckoned now). A register frozen before its overtime columns leaves them empty. */
export function registerCsv(rows: ReadonlyArray<Record<string, unknown>>): string {
  const cols = ['code', 'name', 'days', 'late', 'leave', 'absent', 'unpaid', 'hours', 'ot', 'otRest', 'otPh'] as const
  const head = ['Employee code', 'Name', 'Days in', 'Late', 'Leave', 'Absent', 'Unpaid days', 'Hours worked', 'OT hours', 'Rest-day OT hours', 'Holiday OT hours']
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [head.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n') + '\n'
}
