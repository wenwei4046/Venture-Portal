import dayjs from 'dayjs'

// The month-by-month reports' period (2026-10-09, the user's Claude Design
// handoff): From – To within one fiscal year, To by default this month and
// From by default January. `period` stays the URL's name for To, as the
// exports and the single-month twins already read it.

const YM = /^\d{4}-\d{2}$/

export interface ReportRange {
  from: string
  to: string
  year: number
  /** To's month, 1–12 — what the matrix builders take. */
  throughMonth: number
  /** From is January: the matrix is used as built. */
  wholeYear: boolean
}

export function reportRange(params: { from?: string; period?: string }, nowYM: string): ReportRange {
  const to = YM.test(params.period ?? '') ? (params.period as string) : nowYM
  const year = Number(to.slice(0, 4))
  const jan = `${year}-01`
  const asked = YM.test(params.from ?? '') ? (params.from as string) : jan
  const from = asked.slice(0, 4) === to.slice(0, 4) && asked <= to ? asked : jan
  return { from, to, year, throughMonth: Number(to.slice(5, 7)), wholeYear: from === jan }
}

/** "Jan – Oct 2026", "Oct 2026" when one month. */
export function rangeLabel(from: string, to: string): string {
  const a = dayjs(`${from}-01`)
  const b = dayjs(`${to}-01`)
  return from === to ? b.format('MMM YYYY') : `${a.format('MMM')} – ${b.format('MMM YYYY')}`
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

/** From's choices: January to To, in To's year. */
export function fromChoices(to: string): string[] {
  const year = to.slice(0, 4)
  const last = Number(to.slice(5, 7))
  return Array.from({ length: last }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
}
