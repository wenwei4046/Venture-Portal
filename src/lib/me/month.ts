import {
  addDays, dayInfo, dayMon, firstOfMonth, indexMonth, isLeaveCode, longDay, monthDays, monthLabel, monthName, toMin, weekday,
  type Ctx, type DayInfo,
} from '@/lib/attendance/engine'
import type { AttConfig, AttRequest } from '@/lib/attendance/types'
import { dur, fmtN } from './format'
import type { Tone } from './requests'
import type { MeData } from './types'

/**
 * Me › Attendance (2026-10-17, the handoff's `isAtt`): the month's totals, the calendar's whole-cell wash, the day
 * card, and what needs doing before HR closes the month — reckoned by the same engine HR's Records use
 * (lib/attendance/engine.ts), so the two never disagree. Pure.
 */

/** The engine's settings, from one's own reader. */
export function configOf(d: MeData): AttConfig {
  return {
    today: d.workDay, now: d.now.slice(0, 5), canCreate: false, canEdit: false, canApprove: false, me: d.me?.id ?? '',
    people: d.me ? [d.me] : [], titles: [], levels: [], departments: [],
    schedules: d.schedules, locations: d.locations, holidays: d.holidays, assignments: d.assignments,
    leaveTypes: d.leaveTypes, otRates: d.otRates, policies: d.policies, routes: d.routes,
  }
}

export const ctxOf = (d: MeData): Ctx => ({ config: configOf(d), month: d.month, today: d.workDay, now: d.now.slice(0, 5) })

/** The day HR closes a month: the 3rd of the next (Attendance › Month close). */
export const closesOn = (month: string) => addDays(firstOfMonth(addDays(firstOfMonth(month), 40)), 2)

export type Wash = 'present' | 'late' | 'incomplete' | 'leave'

export interface Cell {
  day: string
  n: number
  wash: Wash | null
  /** A weekend, rest day or holiday: the grey cell. */
  off: boolean
  /** Ink-3 lettering: off, the future, a day not counted. */
  muted: boolean
  today: boolean
}

export interface Fact {
  label: string
  value: string
  mono?: boolean
}

export interface DayCard {
  day: string
  title: string
  tone: Tone
  status: string
  facts: Fact[]
  /** Incomplete or absent: "File a correction", for this punch. */
  fix: { dir: 'in' | 'out'; time: string } | null
}

export interface Need {
  key: string
  tone: 'danger' | 'info'
  title: string
  body: string
  action: { label: 'Fix'; day: string; dir: 'in' | 'out'; time: string } | { label: 'Claim OT'; day: string; hours: number; out: string; past: string; end: string }
}

export interface MonthView {
  month: string
  label: string
  closed: boolean
  closeDay: string
  totals: Array<{ label: string; value: string; note: string }>
  lead: number
  cells: Cell[]
  card: (day: string) => DayCard
  needs: Need[]
  /** Days you can pick on the calendar: the month's, up to today (and the rest as plain cells). */
  defaultDay: string
}

const isOt = (r: AttRequest, day: string) => r.kind === 'ot' && r.from === day && (r.status === 'pending' || r.status === 'approved')
const isCorrection = (r: AttRequest, day: string) => r.kind === 'correction' && r.from === day && (r.status === 'pending' || r.status === 'approved')

/**
 * Minutes past the schedule's end on a worked day that could be claimed — 30 or more, the smallest claim — unless an
 * overtime request already names the day. A few minutes past six is leaving, not overtime (the handoff counts only
 * 13 Oct's 1 h 42 m, not 1 Oct's 18:03).
 */
function pastEnd(info: DayInfo, day: string, requests: readonly AttRequest[]): number {
  if (!info.out || !info.sday?.end || info.sday.type !== 'work') return 0
  if (requests.some(r => isOt(r, day))) return 0
  const past = toMin(info.out) - toMin(info.sday.end)
  return past >= 30 ? past : 0
}

export function monthView(d: MeData): MonthView | null {
  if (!d.me) return null
  const me = d.me
  const ctx = ctxOf(d)
  const idx = indexMonth(d.month)
  const days = monthDays(d.month.month)
  const today = d.workDay
  const infos = days.map(day => dayInfo(me, day, ctx, idx))
  const leaveCodes = new Set(d.leaveTypes.map(t => t.code))
  const washOf = (code: string): Wash | null =>
    code === 'P' ? 'present' : code === 'L' ? 'late' : code === 'I' || code === 'A' ? 'incomplete'
      : leaveCodes.has(code) || code.endsWith('?') ? 'leave' : null
  const OFF = new Set(['W', 'H', 'CH', 'SO'])

  const cells: Cell[] = days.map((day, i) => {
    const code = infos[i].code
    const wash = washOf(code)
    const off = OFF.has(code)
    return { day, n: i + 1, wash, off, muted: !wash && (off || day > today || code === ''), today: day === today }
  })

  // ── Totals ──
  const past = days.map((day, i) => ({ day, info: infos[i] })).filter(x => x.day <= today)
  const workDays = past.filter(x => x.info.code !== '' && !OFF.has(x.info.code)).length
  const present = past.filter(x => x.info.code === 'P' || x.info.code === 'L').length
  const punches = past.reduce((a, x) => a + (['P', 'L', 'I'].includes(x.info.code) ? (x.info.in ? 1 : 0) + (x.info.out ? 1 : 0) : 0), 0)
  const missing = past.reduce((a, x) => a + (x.info.code === 'I' ? 1 : x.info.code === 'A' ? 2 : 0), 0)
  const lateDays = past.filter(x => x.info.code === 'L')
  const lateMin = lateDays.reduce((a, x) => a + x.info.lateMin, 0)
  const otPaid = d.requests.filter(r => r.kind === 'ot' && r.status === 'approved' && r.from && r.from.slice(0, 7) === d.month.month.slice(0, 7))
    .reduce((a, r) => a + Number(r.hours ?? 0), 0)
  const unclaimed = past.reduce((a, x) => a + pastEnd(x.info, x.day, d.requests), 0)
  const totals = [
    { label: 'Present', value: `${present} d`, note: `of ${workDays} work day${workDays === 1 ? '' : 's'}` },
    { label: 'Punches', value: `${punches}`, note: `${missing} missing` },
    { label: 'Late', value: `${lateMin} min`, note: `${lateDays.length} day${lateDays.length === 1 ? '' : 's'}` },
    { label: 'OT paid', value: `${fmtN(otPaid)} h`, note: unclaimed ? `${dur(unclaimed * 60)} unclaimed` : 'none unclaimed' },
  ]

  const closed = d.month.close?.status === 'closed'
  const closeDay = closed && d.month.close?.closedAt ? d.month.close.closedAt.slice(0, 10) : closesOn(d.month.month)

  // ── The day card ──
  const card = (day: string): DayCard => {
    const i = days.indexOf(day)
    const info = i >= 0 ? infos[i] : dayInfo(me, day, ctx, idx)
    const code = info.code
    const leave = d.month.leave.find(l => l.from <= day && l.to >= day)
    const type = (c: string) => d.leaveTypes.find(t => t.code === c)
    const [tone, status]: [Tone, string] =
      code === 'P' ? ['success', 'Present'] : code === 'L' ? ['warning', 'Late'] : code === 'I' ? ['danger', 'Incomplete'] : code === 'A' ? ['danger', 'Absent']
        : code === 'W' ? ['neutral', info.sday?.type === 'rest' ? 'Rest day' : 'Off day']
        : code === 'H' ? ['neutral', 'Holiday'] : code === 'CH' ? ['neutral', 'Company holiday'] : code === 'SO' ? ['neutral', 'Special off']
        : code.endsWith('?') ? ['warning', 'Leave · waiting']
        : isLeaveCode(code, ctx.config) ? ['info', type(code)?.name ?? code]
        : code === '·' ? ['neutral', 'Not in yet']
        : day > today && info.sday?.type === 'work' ? ['neutral', 'Work day'] : ['neutral', info.tracked ? 'Work day' : 'Not counted']
    const corr = d.requests.find(r => isCorrection(r, day))
    const ot = d.requests.find(r => isOt(r, day))
    const extra = pastEnd(info, day, d.requests)
    const note = info.edited ? `Changed by HR${info.note ? ` · ${info.note}` : ''}`
      : corr ? (corr.status === 'approved' ? `${String(corr.detail.punch ?? '').toUpperCase() || 'Punch'} corrected · ${corr.ref}` : `Correction waiting · ${corr.ref}`)
      : leave && (isLeaveCode(code, ctx.config) || code.endsWith('?')) ? leave.ref
      : info.holiday ? info.holiday
      : code === 'L' ? `Late ${info.lateMin} min`
      : code === 'I' ? 'No OUT punch'
      : code === 'A' ? 'No punch'
      : ot ? (ot.status === 'approved' ? `OT ${fmtN(Number(ot.hours ?? 0))} h paid` : `OT ${fmtN(Number(ot.hours ?? 0))} h waiting`)
      : extra ? `${dur(extra * 60)} unclaimed`
      : info.flags.length ? info.flags.join(' · ')
      : day === today && info.in ? 'Today'
      : '—'
    const fix = !closed && !corr && (code === 'I' || code === 'A')
      ? code === 'I' ? { dir: 'out' as const, time: info.sday?.end ?? '18:00' } : { dir: 'in' as const, time: info.sday?.start ?? '09:00' }
      : null
    return {
      day, title: longDay(day), tone, status, fix,
      facts: [{ label: 'IN', value: info.in ?? '—', mono: true }, { label: 'OUT', value: info.out ?? '—', mono: true }, { label: 'Note', value: note }],
    }
  }

  return {
    month: d.month.month,
    label: monthLabel(d.month.month),
    closed,
    closeDay,
    totals,
    lead: (weekday(days[0]) + 6) % 7,
    cells,
    card,
    needs: closed ? [] : needsOf(d, infos, days),
    defaultDay: today.slice(0, 7) === d.month.month.slice(0, 7) ? today : days[days.length - 1],
  }
}

/** What needs doing before the month closes: a missing OUT, a day with no punch, time past the end nobody claimed. */
export function needsOf(d: MeData, infos: readonly DayInfo[], days: readonly string[]): Need[] {
  const today = d.workDay
  const month = d.month.month
  const by = `before HR closes ${monthName(month)} on ${dayMon(closesOn(month))}.`
  const out: Need[] = []
  days.forEach((day, i) => {
    if (day > today) return
    const info = infos[i]
    const corrected = d.requests.some(r => isCorrection(r, day))
    if (!corrected && day < today && (info.code === 'I' || info.code === 'A')) {
      const missingOut = info.code === 'I'
      out.push({
        key: `fix:${day}`, tone: 'danger',
        title: missingOut ? `${dayMon(day)} has no OUT punch` : `${dayMon(day)} has no punch`,
        body: `File a correction ${by}`,
        action: { label: 'Fix', day, dir: missingOut ? 'out' : 'in', time: (missingOut ? info.sday?.end : info.sday?.start) ?? (missingOut ? '18:00' : '09:00') },
      })
    }
    const extra = pastEnd(info, day, d.requests)
    if (extra >= 30 && info.out && info.sday?.end) {
      out.push({
        key: `ot:${day}`, tone: 'info',
        title: `${dur(extra * 60)} past ${info.sday.end} on ${dayMon(day)}`,
        body: 'Extra time is not paid unless OT is approved.',
        action: { label: 'Claim OT', day, hours: Math.floor(extra / 30) / 2, out: info.out, past: dur(extra * 60), end: info.sday.end },
      })
    }
  })
  return out
}

/** The schedule's words for the page's sub line: "Office 9–6 · Mon–Fri". */
export function scheduleWords(d: MeData): string | null {
  if (!d.me) return null
  const ctx = ctxOf(d)
  const info = dayInfo(d.me, d.workDay, ctx, indexMonth(d.month))
  const s = info.schedule
  if (!info.tracked) return null
  if (!s) return info.assignment?.mode === 'no_clock' ? 'Fixed hours' : null
  const NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const work = s.days.map((x, i) => (x.type === 'work' ? i : -1)).filter(i => i >= 0)
  const run = work.length && work.every((v, k) => k === 0 || v === work[k - 1] + 1)
  const span = !work.length ? '' : work.length === 1 ? NAMES[work[0]] : run ? `${NAMES[work[0]]}–${NAMES[work[work.length - 1]]}` : work.map(i => NAMES[i]).join(', ')
  return span ? `${s.name} · ${span}` : s.name
}
