import { officeDay, officeTime } from '@/lib/office-time'

export function formatMoney(amount: number | null | undefined): string {
  const val = amount ?? 0
  const formatted = Math.abs(val).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  // Negatives render as parenthesis notation per DESIGN.md money format spec.
  // Callers that need color should wrap in text-danger conditional on val < 0.
  return val < 0 ? `RM (${formatted})` : `RM ${formatted}`
}

// Bare number formatting — no RM prefix. Use in dense ledger tables where
// an "RM" column header already implies the currency, or inside print
// statements where repeating "RM" on every line is visual noise. Keeps the
// parenthesis notation for negatives so the sign is preserved.
//
// Prefer formatMoney() for headlines, cards, and standalone numbers. Use
// formatMoneyBare() only when the surrounding context already provides
// currency disambiguation.
export function formatMoneyBare(amount: number | null | undefined): string {
  const val = amount ?? 0
  const formatted = Math.abs(val).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return val < 0 ? `(${formatted})` : formatted
}

export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`
}

/**
 * The day of a date or a moment, on the office's calendar. A date column
 * (`2026-10-09`) is the day it names; a moment (a timestamp, a Date) is the
 * office's day it fell on — read on the server's own clock (UTC on Vercel)
 * an ERP sync at 07:30 in the office printed as the day before.
 */
const officeCalendar = (date: string | Date) => (typeof date === 'string' ? officeDay(date) : officeTime(date))

export function formatDate(date: string | Date): string {
  return officeCalendar(date).format('DD MMM YYYY')
}

export function formatMonth(date: string | Date): string {
  return officeCalendar(date).format('MMM YYYY')
}

/**
 * `Intl.DateTimeFormat` with a three-letter month: "4 Sep 2026", never
 * "4 Sept 2026". en-GB and en-MY spell September "Sept" in current ICU (CLDR
 * 38+) and every other month in three letters, so a page that used them read
 * "Sept" beside formatDate()'s "Sep" (2026-10-03, the Arena's Fair results
 * against its brand weeks). DESIGN.md › Date format: "9 Apr 2026". The locale
 * still sets the order and the clock ("4 Sep, 12:00 am" in en-MY); only the
 * month's NAME is cut to three letters.
 */
export function formatIntlDate(date: Date, options: Intl.DateTimeFormatOptions, locale = 'en-MY'): string {
  return new Intl.DateTimeFormat(locale, options)
    .formatToParts(date)
    .map((part) => (part.type === 'month' && options.month === 'short' ? part.value.slice(0, 3) : part.value))
    .join('')
}

// Returns the first day of the month (YYYY-MM-01) for the given date, or for
// "now" when no date is passed. Malaysia is UTC+8 (no DST) but the server runs
// in UTC, so deriving the current month from raw UTC rolls over 8 hours late —
// on the 1st, 00:00–08:00 MYT is still the previous month in UTC. Shift into
// MYT wall-clock before taking the month boundary so the portal's "current
// period" matches the local Malaysian calendar.
export function getPeriodMonth(date?: Date): string {
  const myt = new Date((date ?? new Date()).getTime() + 8 * 60 * 60 * 1000)
  return `${myt.getUTCFullYear()}-${String(myt.getUTCMonth() + 1).padStart(2, '0')}-01`
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

// Extract the funding-source remark Finance appends to loans.repayment_terms,
// e.g. "EMI 分期 · 月息4% · 6期 · [LO#3] · 资金来源: HC-58k" → "HC-58k", or
// "… · 资金从 Kingsley 借过来" → "Kingsley". Returns null when no remark.
// Display-only — never used to match data.
export function fundingSourceFromTerms(terms: string | null | undefined): string | null {
  if (!terms) return null
  const src = terms.match(/资金来源[:：]\s*([^·]+)/)
  if (src?.[1]) return src[1].trim() || null
  const from = terms.match(/资金从\s*(.+?)\s*借过来/)
  if (from?.[1]) return from[1].trim() || null
  return null
}

// Mirror remark for the OTHER direction (user 2026-08-06: "这笔是借给谁我自己
// 加"): Finance writes 「借给: 2990」 (or 借去/转借给) in a fund source's notes
// to record where borrowed-in money was lent onward. e.g.
// "HC 定存 · 借给: 2990" → "2990". Display-only — never used to match data.
export function lentToFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null
  // English UI (2026-08-06) writes "lent to: X"; legacy notes use 借给/借去.
  const m = notes.match(/(?:转?借给|借去|lent to)[:：]?\s*([^·\n,，;；]+)/i)
  return m?.[1]?.trim() || null
}
