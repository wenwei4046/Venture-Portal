// A deal's repayment start (2026-10-12, user: 现在只能选月份不能选日期 →
// expected repayment 和 repayment start date 应该要一样): the date its first
// instalment falls due, every later one on the same day of the month. Finance
// picks it on the deal's page — a fund source keeps it as its repayment_date
// (the page's Expected repayment), a loan as its repayment_start_date — and
// its month stays in repayment_start_month for the readers that go by month.
// Unpicked, it is the month after the money moved, on that day.

import { resolveFirstDueYM } from './treasury-terms'

export interface RepaymentStart {
  /** YYYY-MM-DD the first instalment falls due; null with nothing to go by. */
  date: string | null
  /** The day of the month every instalment falls due. */
  day: number
  /** Finance set it: a date, or a month before dates could be picked. */
  set: boolean
}

const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

function dueOn(ym: string, day: number): string {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${ym}-${String(Math.min(Math.max(1, day), last)).padStart(2, '0')}`
}

/**
 * `picked` counts while its month is the start month — both are written
 * together — so an early record's expected repayment in another month stays a
 * note. Without it, the day is the money's.
 */
export function repaymentStart(picked: unknown, month: unknown, moneyDate: unknown): RepaymentStart {
  const startMonth = text(month)
  const money = text(moneyDate)
  const ym = resolveFirstDueYM(startMonth, money)
  const date = text(picked)
  const own = date && startMonth && ym && date.slice(0, 7) === ym ? date.slice(0, 10) : null
  const day = own ? Number(own.slice(8, 10)) : money ? Number(money.slice(8, 10)) || 1 : 1
  return { date: ym ? dueOn(ym, day) : null, day, set: !!startMonth }
}

/** A fund source's: its Expected repayment, from its effective date. */
export const fundSourceStart = (s: { repayment_date?: unknown; repayment_start_month?: unknown; effective_date?: unknown }): RepaymentStart =>
  repaymentStart(s.repayment_date, s.repayment_start_month, s.effective_date)

/** A loan's: its repayment start date, from its disbursement. */
export const loanStart = (l: { repayment_start_date?: unknown; repayment_start_month?: unknown; disbursement_date?: unknown }): RepaymentStart =>
  repaymentStart(l.repayment_start_date, l.repayment_start_month, l.disbursement_date)

/** The start a deal has while Finance has set none: the month after the money moved, on its day. */
export const defaultStart = (moneyDate: unknown): string | null => repaymentStart(null, null, moneyDate).date
