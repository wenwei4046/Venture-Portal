// A recurring task's rule (New Project's Repeat, `New Project.dc.html`; mig 20261023234000 keeps it on the series as
// recur.rule): every day; every 1, 2 or 4 weeks on the weekdays picked; every month on the 1st, the 15th or the last
// day — from a start, until a day, for so many runs, or with no end. The days it opens a run on are reckoned here for
// the form's preview exactly as the database's mkt_recur_days reckons them for the runs it makes. Pure.

import { addDays, daysBetween, longDay, MONTH_SHORT, mondayOf, weekdayOf } from './board'

export type RecurFreq = 'daily' | 'weekly' | 'monthly'
export type RecurEnd = 'date' | 'count' | 'never'
export type MonthDay = '1' | '15' | 'last'

export interface RecurRule {
  freq: RecurFreq
  /** Weekly: 1 = Monday … 7 = Sunday. */
  days: number[]
  /** Weekly: every 1, 2 or 4 weeks, counted from the start's week. */
  every: 1 | 2 | 4
  mday: MonthDay
  start: string
  endMode: RecurEnd
  end: string
  count: number
}

export const FREQS: readonly { key: RecurFreq; label: string }[] = [
  { key: 'daily', label: 'Day' },
  { key: 'weekly', label: 'Week' },
  { key: 'monthly', label: 'Month' },
]
export const INTERVALS: readonly { key: 1 | 2 | 4; label: string }[] = [
  { key: 1, label: 'Every week' },
  { key: 2, label: 'Every 2 weeks' },
  { key: 4, label: 'Every 4 weeks' },
]
export const MONTH_DAYS: readonly { key: MonthDay; label: string }[] = [
  { key: '1', label: '1st' },
  { key: '15', label: '15th' },
  { key: 'last', label: 'Last day' },
]
export const ENDS: readonly { key: RecurEnd; label: string }[] = [
  { key: 'date', label: 'On a date' },
  { key: 'count', label: 'After' },
  { key: 'never', label: 'No end date' },
]
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** The day after a month ends, less one: the last day of `d`'s month. */
const lastOfMonth = (d: string) => {
  const y = +d.slice(0, 4)
  const m = +d.slice(5, 7)
  return new Date(Date.UTC(y, m, 0, 12)).toISOString().slice(0, 10)
}

/** A new rule: every Monday, from today to the end of the third month on. */
export function defaultRule(today: string): RecurRule {
  const y = +today.slice(0, 4)
  const m = +today.slice(5, 7)
  const end = new Date(Date.UTC(y, m + 2, 0, 12)).toISOString().slice(0, 10)
  return { freq: 'weekly', days: [1], every: 1, mday: '1', start: today, endMode: 'date', end, count: 12 }
}

/** The days the rule opens a run on, from its start up to `until` (and its end), at most `cap`. */
export function recurDays(rule: RecurRule, until: string, cap = 999): string[] {
  const out: string[] = []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rule.start)) return out
  const end = rule.endMode === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(rule.end) ? rule.end : null
  const most = Math.max(0, Math.min(cap, rule.endMode === 'count' ? Math.trunc(rule.count) || 0 : 999))
  const week0 = mondayOf(rule.start)
  for (let d = rule.start; out.length < most && d <= until && (!end || d <= end); d = addDays(d, 1)) {
    let hit = false
    if (rule.freq === 'daily') hit = true
    else if (rule.freq === 'weekly') hit = rule.days.includes(weekdayOf(d) + 1) && Math.floor(daysBetween(week0, d) / 7) % Math.max(1, rule.every) === 0
    else if (rule.freq === 'monthly') hit = rule.mday === 'last' ? d === lastOfMonth(d) : +d.slice(8, 10) === +rule.mday
    if (hit) out.push(d)
  }
  return out
}

/** "Every week on Monday, Wednesday" · "Every 2 weeks on Friday" · "Every day" · "Every month on the 15th". */
export function ruleText(rule: RecurRule): string {
  if (rule.freq === 'daily') return 'Every day'
  if (rule.freq === 'monthly') return `Every month on the ${rule.mday === 'last' ? 'last day' : rule.mday === '1' ? '1st' : `${rule.mday}th`}`
  const names = [...rule.days].sort((a, b) => a - b).map(d => DAY_NAMES[d - 1]).filter(Boolean).join(', ')
  return `Every ${rule.every > 1 ? `${rule.every} weeks` : 'week'} on ${names || '—'}`
}

/** "2 Nov 2026" */
export const fullDay = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${+d.slice(8, 10)} ${MONTH_SHORT[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : '—')

/** "2 Nov 2026 → 31 Jan 2027" · "from 2 Nov 2026 · 12 runs" · "from 2 Nov 2026 · no end date". */
export function periodText(rule: RecurRule): string {
  if (rule.endMode === 'date') return `${fullDay(rule.start)} → ${fullDay(rule.end)}`
  if (rule.endMode === 'count') return `from ${fullDay(rule.start)} · ${rule.count} runs`
  return `from ${fullDay(rule.start)} · no end date`
}

/** What the Repeat block shows under the rule: how many runs, the first six, what comes after. */
export function recurPreview(rule: RecurRule): { ok: boolean; count: string; first: string[]; more: string | null } {
  const until = rule.endMode === 'never' ? addDays(rule.start, 400) : addDays(rule.start, 3650)
  const runs = recurDays(rule, until, rule.endMode === 'never' ? 8 : 999)
  if (runs.length === 0) return { ok: false, count: 'No runs in this period', first: [], more: null }
  const count = rule.endMode === 'never' ? 'Runs until you end it' : `${runs.length} run${runs.length > 1 ? 's' : ''}`
  const more = rule.endMode === 'never' ? '…' : runs.length > 6 ? `+${runs.length - 6} more · last ${longDay(runs[runs.length - 1])}` : null
  return { ok: true, count, first: runs.slice(0, 6).map(longDay), more }
}

/** The rule as mkt_task_create takes it. */
export function rulePayload(rule: RecurRule): Record<string, unknown> {
  const base: Record<string, unknown> = { freq: rule.freq, start: rule.start, endMode: rule.endMode }
  if (rule.freq === 'weekly') Object.assign(base, { days: [...rule.days].sort((a, b) => a - b), every: rule.every })
  if (rule.freq === 'monthly') base.mday = rule.mday
  if (rule.endMode === 'date') base.end = rule.end
  if (rule.endMode === 'count') base.count = Math.trunc(rule.count)
  return base
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** A rule as the database keeps it (recur.rule) — null when it is not one. */
export function ruleFromRow(v: unknown): RecurRule | null {
  if (!isObj(v) || !['daily', 'weekly', 'monthly'].includes(String(v.freq)) || typeof v.start !== 'string') return null
  const every = Number(v.every)
  return {
    freq: v.freq as RecurFreq,
    days: Array.isArray(v.days) ? v.days.map(Number).filter(n => n >= 1 && n <= 7) : [],
    every: every === 2 || every === 4 ? every : 1,
    mday: v.mday === '15' || v.mday === 'last' ? v.mday : '1',
    start: v.start.slice(0, 10),
    endMode: v.endMode === 'date' || v.endMode === 'count' ? v.endMode : 'never',
    end: typeof v.end === 'string' ? v.end.slice(0, 10) : '',
    count: Number.isFinite(Number(v.count)) ? Math.trunc(Number(v.count)) : 0,
  }
}
