import dayjs from 'dayjs'
import { fyStartOf } from './fiscal-year'

// The month-by-month reports' period (2026-10-09, the user's Claude Design
// handoff): From – To within one fiscal year, To by default this month and
// From by default January. `period` stays the URL's name for To, as the
// exports and the single-month twins already read it.
//
// A department's page (2026-10-25, its charts) also reaches back across the
// year — its "12 months" is Nov – Oct — so From may stand up to eleven months
// before To there (`crossYear`); the builders then start at From.
//
// The year is the financial year (2026-11-24, lib/fiscal-year): From by default
// its first month — July, or January 2025 in the first, eighteen-month year —
// and no earlier. A From before To's January has the builders start there.

const YM = /^\d{4}-\d{2}$/

export interface ReportRange {
  from: string
  to: string
  year: number
  /** To's month, 1–12 — what the matrix builders take. */
  throughMonth: number
  /** From is the financial year's first month — the period as it opens, nothing asked. */
  wholeYear: boolean
  /** From before To's January (`crossYear` only): where the builders start, the matrix then used as built. */
  buildFrom?: string
}

/** The month `n` months after `ym` (before it when negative). */
export function shiftMonth(ym: string, n: number): string {
  return dayjs(`${ym}-01`).add(n, 'month').format('YYYY-MM')
}

export function reportRange(params: { from?: string; period?: string }, nowYM: string, opts: { crossYear?: boolean } = {}): ReportRange {
  const to = YM.test(params.period ?? '') ? (params.period as string) : nowYM
  const year = Number(to.slice(0, 4))
  const jan = `${year}-01`
  const fy = fyStartOf(to)
  const asked = YM.test(params.from ?? '') ? (params.from as string) : fy
  const earliest = earliestFrom(to, opts.crossYear)
  const from = asked >= earliest && asked <= to ? asked : fy
  return { from, to, year, throughMonth: Number(to.slice(5, 7)), wholeYear: from === fy, ...(from < jan ? { buildFrom: from } : {}) }
}

/** How far back From may go: the financial year's first month, or eleven months before To on a department's page if that is earlier. */
function earliestFrom(to: string, crossYear?: boolean): string {
  const fy = fyStartOf(to)
  const twelve = shiftMonth(to, -11)
  return crossYear && twelve < fy ? twelve : fy
}

/** "Jan – Oct 2026", "Oct 2026" when one month, "Nov 2025 – Oct 2026" across a year. */
export function rangeLabel(from: string, to: string): string {
  const a = dayjs(`${from}-01`)
  const b = dayjs(`${to}-01`)
  if (from === to) return b.format('MMM YYYY')
  return `${a.format(from.slice(0, 4) === to.slice(0, 4) ? 'MMM' : 'MMM YYYY')} – ${b.format('MMM YYYY')}`
}

/** To's choices: every month from January of `years` years back to this month, latest first. */
export function toChoices(nowYM: string, years = 2): string[] {
  const out: string[] = []
  let m = dayjs(`${nowYM}-01`)
  const stop = dayjs(`${Number(nowYM.slice(0, 4)) - (years - 1)}-01-01`)
  while (!m.isBefore(stop)) {
    out.push(m.format('YYYY-MM'))
    m = m.subtract(1, 'month')
  }
  return out
}

const monthsFrom = (first: string, last: string): string[] => {
  const out: string[] = []
  for (let m = first; m <= last; m = shiftMonth(m, 1)) out.push(m)
  return out
}

/** From's choices: the financial year's first month to To. */
export function fromChoices(to: string): string[] {
  return monthsFrom(earliestFrom(to), to)
}

/** A department's From choices: the twelve months up to To, oldest first — from the financial year's start when that is further back. */
export function crossYearFromChoices(to: string): string[] {
  return monthsFrom(earliestFrom(to, true), to)
}
