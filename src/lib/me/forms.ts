import { addDays, dayInfo, dayMon, indexMonth, monthName, toMin, fromMin } from '@/lib/attendance/engine'
import { hoursADay, otDayType, otEnd, type OtDayType } from '@/lib/attendance/payroll'
import type { ScheduleDay } from '@/lib/attendance/types'
import { fmtN } from './format'
import { ctxOf } from './month'
import { correctionLine, goesTo, quotaFor, routeFor, routeShort } from './requests'
import type { MeData, MeFair } from './types'

/**
 * Me › Submit request's three forms (2026-10-17, the handoff's OT, Correct a punch and Extra manpower sheets): the
 * longest a day may run, the rate a day is paid at, the month's corrections left, the person-days a fair asks for —
 * each from the settings HR keeps (Settings › Schedules, OT rules, Policy). Pure.
 */

/**
 * The schedule's row for a person's day, what kind of day it is, and whether they punch — as payroll reckons it
 * (`otDayType`: a covering holiday is a public holiday, a company holiday an off day), so the sheet says what is paid.
 */
export function dayOf(d: MeData, day: string): { row: ScheduleDay | null; kind: OtDayType; hoursADay: number; clocks: boolean } {
  if (!d.me) return { row: null, kind: 'work', hoursADay: 8, clocks: true }
  const info = dayInfo(d.me, day, ctxOf(d), indexMonth(d.month))
  return { row: info.sday, kind: otDayType({ detail: {} }, info, day), hoursADay: hoursADay(info.schedule), clocks: info.assignment?.mode !== 'no_clock' }
}

// ── Overtime ────────────────────────────────────────────────────────────────

/** A work day may run 12 hours at most (Employment Act s.60A): what is left after the scheduled span; a day off, all 12. */
export function otMax(d: MeData, day: string): number {
  const { row, kind } = dayOf(d, day)
  if (kind !== 'work' || !row?.start || !row.end) return 12
  const span = (toMin(row.end) - toMin(row.start)) / 60
  return Math.max(0, Math.floor((12 - span) * 2) / 2)
}

/** "After 18:00": the schedule's end that day (18:00 without one). */
export const otAfter = (d: MeData, day: string) => otEnd(dayOf(d, day).row)

/** The rate box's first line, from Settings › OT rules. */
export function otRateLine(d: MeData, day: string): string {
  const { kind, hoursADay } = dayOf(d, day)
  const m = (k: string) => fmtN(d.otRates.find(r => r.dayType === k)?.multiplier ?? ({ work: 1.5, off: 1.5, rest: 2, ph: 3 } as Record<string, number>)[k])
  if (kind === 'ph') return `Public holiday · ${m('ph')} × your hourly rate`
  if (kind === 'rest') return `Rest day · up to ${fmtN(hoursADay / 2)} h: ½ day's pay · up to ${fmtN(hoursADay)} h: 1 day · beyond: ${m('rest')} × hourly`
  if (kind === 'off') return `Off day · every hour at ${m('off')} × your hourly rate`
  return `Work day · ${m('work')} × your hourly rate`
}

export interface OtForm {
  date: string
  hours: number
  reason: string
  after: boolean
}

export interface OtCheck {
  max: number
  /** Shown under the form: only the longest-day refusal. */
  shown: string
  /** Anything that keeps Send off. */
  error: string
  rate: string
  /** How payroll pays it — what `lib/attendance/payroll.ts` does, word for word (2026-10-17). */
  paid: string
  /** Under the hours: where the time counts from — past the end on a work day, every hour on any other. */
  steps: string
  route: string
}

export function checkOt(d: MeData, f: OtForm): OtCheck {
  const max = otMax(d, f.date)
  const { row, kind, clocks } = dayOf(d, f.date)
  const shown = f.hours > max ? `That makes the day longer than 12 h. The most you can ask is ${fmtN(max)} h.` : ''
  const punched = kind === 'work' ? `past ${otEnd(row)}` : 'from IN to OUT'
  return {
    max,
    shown,
    error: shown || (!f.reason.trim() ? 'Say what needs the extra time.' : ''),
    rate: otRateLine(d, f.date),
    paid: clocks ? `Paid = the smaller of approved and punched ${punched}, rounded down to 30 min.` : 'Paid = the hours approved.',
    steps: `${kind === 'work' ? `After ${otEnd(row)}` : 'Every hour counts'} · in 30-minute steps`,
    route: goesTo(routeFor('OT', d), d.me),
  }
}

/** What an OT request carries beyond its hours: claimed after the fact, and on a work day the hours it asks for. */
export function otDetail(d: MeData, f: OtForm): Record<string, unknown> {
  const { kind } = dayOf(d, f.date)
  if (kind !== 'work') return { after: f.after }
  const from = otAfter(d, f.date)
  const to = fromMin(Math.min(24 * 60 - 1, toMin(from) + Math.round(f.hours * 60)))
  return { after: f.after, from, to }
}

// ── Correct a punch ─────────────────────────────────────────────────────────

export interface Quota {
  month: string
  quota: number
  used: number
  left: number
}

/** The month's corrections: allowed, sent (waiting or approved), left. */
export function quotaOf(d: MeData, day: string): Quota {
  const quota = quotaFor(d, day)
  const used = d.requests.filter(r => r.kind === 'correction' && (r.status === 'pending' || r.status === 'approved') && r.from?.slice(0, 7) === day.slice(0, 7)).length
  return { month: monthName(day), quota, used, left: Math.max(0, quota - used) }
}

/** Submit request's row: "2 of 3 left this month · upline decides". */
export function correctionSub(d: MeData): string {
  const q = quotaOf(d, d.workDay)
  return `${q.left} of ${q.quota} left this month · ${routeShort(routeFor('CR', d), d.me)}`
}

export const correctionRoute = (d: MeData) => correctionLine(routeFor('CR', d), d.me)

// ── Extra manpower ──────────────────────────────────────────────────────────

export const MP_ROLES = ['Promoter', 'Helper', 'Driver'] as const
export type MpRole = (typeof MP_ROLES)[number]

/** "For": the fairs coming (Comm Cal's venues), a name repeated told apart by its dates, then the showroom. */
export function fairOptions(fairs: readonly MeFair[]): Array<{ value: string; label: string; from: string | null; to: string | null }> {
  const count = new Map<string, number>()
  for (const f of fairs) count.set(f.name, (count.get(f.name) ?? 0) + 1)
  return [
    ...fairs.map(f => ({ value: f.key, label: (count.get(f.name) ?? 0) > 1 ? `${f.name} · ${dayMon(f.from)}` : f.name, from: f.from, to: f.to })),
    { value: 'HQS', label: 'HQ showroom', from: null, to: null },
  ]
}

/** Calendar days from a to b, inclusive. */
export const spanDays = (from: string, to: string) => (from && to >= from ? Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1 : 0)

/** A fair's days from today on: where the calendar starts when the fair is picked. */
export function fairRange(o: { from: string | null; to: string | null }, today: string): { from: string; to: string } {
  if (!o.from || !o.to) return { from: '', to: '' }
  const from = o.from < today ? today : o.from
  return from > o.to ? { from: '', to: '' } : { from, to: o.to }
}

export const mpRoute = (d: MeData) => goesTo(routeFor('MP', d), d.me, ' to book')
export const otRouteShort = (d: MeData) => routeShort(routeFor('OT', d), d.me)
export const mpRouteShort = (d: MeData) => routeShort(routeFor('MP', d), d.me)

/** A day's IN or OUT time from the schedule, for a correction's default. */
export function scheduleTime(d: MeData, day: string, dir: 'in' | 'out'): string {
  const { row } = dayOf(d, day)
  return (dir === 'in' ? row?.start : row?.end) ?? (dir === 'in' ? '09:00' : '18:00')
}

/** The day before (the calendar's earliest pick for a back-dated request). */
export const before = (day: string, n: number) => addDays(day, -n)
