import { assignmentFor, daysForGroup, groupFor, isoOf, serviceYears, toMin, weekday, yearsOfService } from './engine'
import type { AttConfig, AttLeaveType, AttPerson, AttSchedule, LeaveGroup, ScheduleDay } from './types'

/**
 * HR › Attendance › Settings (2026-10-15): the pure arithmetic and wording the
 * page draws — the prototype's `groupSummary`, the schedule's week and bars,
 * the OT calculator, the holiday month grids and the leave type's Preview of
 * who a set of entitlement groups covers.
 */

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** A new schedule: Mon–Fri 09:00–18:00 with an hour's break, Saturday off, Sunday rest. */
export function blankWeek(): ScheduleDay[] {
  return DAY_NAMES.map((day, i) => (i < 5 ? { day, type: 'work', start: '09:00', end: '18:00', break: 60 } : { day, type: i === 5 ? 'off' : 'rest' }))
}

const hoursOf = (d: ScheduleDay) => (d.type === 'work' && d.start && d.end ? (toMin(d.end) - toMin(d.start) - (d.break ?? 0)) / 60 : 0)

/** Normal hours a week. */
export function weeklyHours(days: readonly ScheduleDay[]): number {
  return Math.round(days.reduce((a, d) => a + hoursOf(d), 0) * 100) / 100
}

export const workDays = (days: readonly ScheduleDay[]) => days.filter(d => d.type === 'work').length

/** "5 work days · 40 h a week" */
export const scheduleSum = (s: AttSchedule) => `${workDays(s.days)} work days · ${weeklyHours(s.days)} h a week`

/** The day block's bar on the 06:00–22:00 strip: percentages for the shift and its hatched break. */
export function dayBar(d: ScheduleDay) {
  const span = 16 * 60
  if (d.type !== 'work' || !d.start || !d.end) return null
  const a = toMin(d.start) - 360, b = toMin(d.end) - 360, mid = (a + b) / 2, br = d.break ?? 0
  return {
    top: `${(a / span) * 100}%`,
    h: `${((b - a) / span) * 100}%`,
    bTop: `${((mid - br / 2) / span) * 100}%`,
    bH: `${(br / span) * 100}%`,
    range: `${d.start}–${d.end}`,
    note: `${(b - a - br) / 60} h${br ? ` · ${br} min break` : ''}`,
  }
}

/** Times every half hour 06:00–22:00 (the schedule window's Start / End). */
export const HALF_HOURS = Array.from({ length: 33 }, (_, i) => {
  const m = 360 + i * 30
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${m % 60 ? '30' : '00'}`
})

/** Day cutover: 00:00–06:00 every 30 min. */
export const CUTOVERS = Array.from({ length: 13 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)

// ── OT ──────────────────────────────────────────────────────────────────────

/** ORP = monthly ÷ 26; HRP = ORP ÷ normal hours a day. */
export function otRates(monthly: number, hoursADay: number) {
  const orp = monthly / 26
  return { orp, hrp: orp / (hoursADay || 8) }
}

export const rm = (v: number) => 'RM ' + v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** The multipliers the OT window offers: never below the Act's minimum. */
export const multipliersFrom = (min: number) => ['1.5', '2', '2.5', '3', '3.5', '4'].filter(v => Number(v) >= min)

// ── Entitlement groups ──────────────────────────────────────────────────────

/** The prototype's groupSummary, with title ids named. */
export function groupSummary(groups: readonly LeaveGroup[], short: boolean, titleName: (id: string) => string = id => id): string {
  if (groups.length === 0) return short ? '0' : 'nobody'
  const one = (g: LeaveGroup) => {
    const titles = g.titles.includes('all') ? null : g.titles
    const levels = g.levels.includes('all') ? null : g.levels.map(l => `L${l}`)
    const who = !titles && !levels ? 'everyone' : [
      !titles ? 'all titles' : titles.length === 1 ? titleName(titles[0]) : `${titles.length} titles`,
      !levels ? '' : levels.length > 2 ? `${levels[0]}–${levels[levels.length - 1]}` : levels.join(', '),
    ].filter(Boolean).join(' · ')
    const steps = [...g.steps].sort((a, b) => a.yrs - b.yrs)
    const d = [g.base, ...steps.map(s => s.days)].join(' → ')
    return short ? (steps.length ? `${d} by service` : String(g.base)) : `${who} · ${d}${steps.length ? ` (at ${steps.map(s => s.yrs + 'y').join(', ')})` : ''}`
  }
  return short ? one(groups[0]) + (groups.length > 1 ? ` · +${groups.length - 1} group${groups.length > 2 ? 's' : ''}` : '') : one(groups[0])
}

/** The unit a leave type counts in ("days in a row" for maternity / paternity). */
export const unitOf = (name: string) => (/maternity|paternity/i.test(name) ? 'days in a row' : 'days a year')

/** The big line on a leave type's card. */
export function entitlementLine(t: AttLeaveType, titleName: (id: string) => string): string {
  if (t.unpaid) return '—'
  if (t.drawsFrom) return `From ${t.drawsFrom}`
  if (!t.groups.length) return '—'
  const s = groupSummary(t.groups, true, titleName)
  if (t.groups[0].steps.length) return s
  return `${s} ${t.counts === 'calendar' ? 'consecutive days' : 'a year'}`
}

/** "L4" for a person, or "—". */
export const levelTag = (p: AttPerson) => (p.level != null ? `L${p.level}` : '—')

export interface PreviewRow { person: AttPerson; days: number; sub: string }

/** Who a set of groups covers, and the days each gets, first matching group winning. */
export function previewGroups(groups: readonly LeaveGroup[], people: readonly AttPerson[], today: string) {
  const covered: Array<PreviewRow & { gi: number }> = []
  const uncovered: Array<{ person: AttPerson; sub: string }> = []
  for (const p of people) {
    const gi = groupFor(p, groups)
    const y = serviceYears(p.hireDate, today)
    const sub = `${p.title ?? '—'} · ${levelTag(p)}${y != null ? ` · ${y} y` : ''}`
    if (gi < 0) uncovered.push({ person: p, sub: `${p.title ?? '—'} · ${levelTag(p)}` })
    else covered.push({ person: p, gi, days: daysForGroup(groups[gi], yearsOfService(p.hireDate, today)), sub })
  }
  return {
    count: `${covered.length} of ${people.length} people covered`,
    groups: groups.map((_, gi) => {
      const rows = covered.filter(x => x.gi === gi).sort((a, b) => b.days - a.days)
      return { n: gi + 1, count: `${rows.length} people`, rows }
    }),
    uncovered,
  }
}

/** Toggle a value in a group's titles / levels; 'all' is the only value when picked, and empty falls back to it. */
export function toggleAll(arr: readonly string[], v: string): string[] {
  if (v === 'all') return ['all']
  const a = arr.filter(x => x !== 'all')
  const i = a.indexOf(v)
  if (i >= 0) a.splice(i, 1)
  else a.push(v)
  return a.length ? a : ['all']
}

// ── Holidays ────────────────────────────────────────────────────────────────

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** A month's grid: blanks before the 1st (Monday first), then the days. */
export function monthCells(year: number, month: number): Array<string | null> {
  const first = isoOf(year, month, 1)
  const lead = (weekday(first) + 6) % 7
  const len = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return [...Array.from({ length: lead }, () => null), ...Array.from({ length: len }, (_, i) => isoOf(year, month, i + 1))]
}

/** "1 Nov 2026" */
export const dmy = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`

/** The first of the next `n` months after today (the From choices). */
export function nextFirsts(today: string, n: number): string[] {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7))
  return Array.from({ length: n }, (_, i) => {
    const k = m + i // m is 1-based, so this is next month + i, 0-based
    return isoOf(y + Math.floor(k / 12), (k % 12) + 1, 1)
  })
}

export const isWeekend = (iso: string) => {
  const w = weekday(iso)
  return w === 0 || w === 6
}

/** Who an assignment's Schedule card counts: "Company default · 24 people", "Title: Driver · 1 person". */
export function scheduleUsers(s: AttSchedule, config: AttConfig, today: string): string {
  const uses = config.assignments.filter(a => a.scheduleId === s.id)
  if (!uses.length) return 'Not assigned yet'
  const a = uses.find(x => x.level === 'company') ?? uses.find(x => x.level === 'title') ?? uses[0]
  // Counted on the day the latest of its assignments starts (today if that is past): a schedule set from 1 Nov counts its people then.
  const on = uses.reduce((d, x) => (x.from > d ? x.from : d), today)
  const n = config.people.filter(p => {
    const best = assignmentFor(p, on, config.assignments)
    return best?.scheduleId === s.id && best.mode !== 'off'
  }).length
  const who = a.level === 'company' ? 'Company default' : a.level === 'title' ? `Title: ${a.label}` : a.label
  return `${who} · ${n} ${n === 1 ? 'person' : 'people'}`
}

/** One CSV line, quoted where it must be. */
export const csvLine = (cells: ReadonlyArray<string | number | null | undefined>) =>
  cells.map(c => {
    const s = c == null ? '' : String(c)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')
