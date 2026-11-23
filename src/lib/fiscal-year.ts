import dayjs from 'dayjs'

// The company's financial year (2026-11-24, the user: "我的结账是在6月" … "第一年是2025一月到2026 6月" … "A，报表自动算").
// The year ends on 30 June. The first one ran 18 months, from incorporation in January 2025 to 30 June 2026; every one
// after it runs July to June. The year is closed in the reports themselves, not by a closing entry: what the P&L made
// before a year's first day is the retained earnings brought forward, what it made since is the profit for the year.

/** The first financial year: incorporation to its first year end. */
export const FIRST_FY = { from: '2025-01', to: '2026-06' } as const
/** The month every financial year ends. */
export const FY_END_MONTH = 6

const ymOf = (s: string) => s.slice(0, 7)
const pad = (m: number) => String(m).padStart(2, '0')

/** The first month (YYYY-MM) of the financial year a month or a day (YYYY-MM[-DD]) falls in. */
export function fyStartOf(ymOrDate: string): string {
  const ym = ymOf(ymOrDate)
  const y = Number(ym.slice(0, 4))
  // Before the company there is no financial year: the calendar's stands in.
  if (ym < FIRST_FY.from) return `${y}-01`
  if (ym <= FIRST_FY.to) return FIRST_FY.from
  const m = Number(ym.slice(5, 7))
  return m > FY_END_MONTH ? `${y}-${pad(FY_END_MONTH + 1)}` : `${y - 1}-${pad(FY_END_MONTH + 1)}`
}

/** The last month (YYYY-MM) of the financial year a month or a day falls in. */
export function fyEndOf(ymOrDate: string): string {
  const ym = ymOf(ymOrDate)
  if (ym < FIRST_FY.from) return `${ym.slice(0, 4)}-12`
  if (ym <= FIRST_FY.to) return FIRST_FY.to
  return dayjs(`${fyStartOf(ym)}-01`).add(11, 'month').format('YYYY-MM')
}

/** The financial year's first day (YYYY-MM-DD). */
export function fyFirstDay(ymOrDate: string): string {
  return `${fyStartOf(ymOrDate)}-01`
}

/** "FY Jan 2025 – Jun 2026", "FY Jul 2026 – Jun 2027". */
export function fyLabel(ymOrDate: string): string {
  const f = (ym: string) => dayjs(`${ym}-01`).format('MMM YYYY')
  return `FY ${f(fyStartOf(ymOrDate))} – ${f(fyEndOf(ymOrDate))}`
}
