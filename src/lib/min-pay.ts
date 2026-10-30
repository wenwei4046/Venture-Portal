import dayjs from 'dayjs'

// Minimum pay interest's month (2026-10-30 — the user: "minimn pay interest 可以set 几时开始吗？"; on its sample they
// picked A, the two choices Amend terms has: From the first instalment / From a later month). A deal's flag was
// undated — on, every month from its first instalment was checked for its interest; it now keeps the month the check
// starts (`min_pay_interest_from`), none for the first instalment.

/** The choice as a form holds it: none picked yet, the first instalment, or a later month (`YYYY-MM`). */
export interface MinPayFrom {
  choice: '' | 'first' | 'later'
  month: string
}

export const NO_MIN_PAY_FROM: MinPayFrom = { choice: '', month: '' }

/** A deal's saved choice: its month (`YYYY-MM-DD`), or none — the first instalment. */
export const savedMinPayFrom = (from: string | null | undefined): MinPayFrom =>
  from ? { choice: 'later', month: from.slice(0, 7) } : { choice: 'first', month: '' }

/** The month the check starts: the later of the first instalment and the month it was set from. */
export function minPayStartYM(firstDueYM: string | null, from: string | null | undefined): string | null {
  const ym = from ? from.slice(0, 7) : null
  if (!ym) return firstDueYM
  return firstDueYM && firstDueYM > ym ? firstDueYM : ym
}

/** The months *From a later month* offers: from the one after the first instalment, two years of them — a year past this month at least. */
export function minPayLaterMonths(firstDueYM: string, nowYM: string): string[] {
  const first = dayjs(`${firstDueYM}-01`).add(1, 'month')
  const ends = [dayjs(`${firstDueYM}-01`).add(24, 'month'), dayjs(`${nowYM}-01`).add(12, 'month')].map((d) => d.format('YYYY-MM'))
  const last = ends[0] > ends[1] ? ends[0] : ends[1]
  const out: string[] = []
  for (let d = first; d.format('YYYY-MM') <= last; d = d.add(1, 'month')) out.push(d.format('YYYY-MM'))
  return out
}

/** What is still to pick, in a form's words — null once the choice is whole. */
export function minPayFromMissing(v: MinPayFrom, laterMonths: readonly string[]): string | null {
  if (v.choice === '') return 'from which month minimum pay starts'
  if (v.choice === 'later' && !laterMonths.includes(v.month)) return 'the month minimum pay starts'
  return null
}

/** What a form sends for it: a later month's `YYYY-MM`, or `first`. */
export const minPayFromField = (v: MinPayFrom): string => (v.choice === 'later' ? v.month : 'first')

/** The month a form sent, as stored: a later month's first day; the first instalment, or nothing, null. */
export function minPayFromDate(raw: unknown): string | null {
  const v = typeof raw === 'string' ? raw.trim() : ''
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? `${v}-01` : null
}

/** "Nov 2026". */
export const monthShort = (ym: string) => dayjs(`${ym}-01`).format('MMM YYYY')
/** "November 2026". */
export const monthLong = (ym: string) => dayjs(`${ym}-01`).format('MMMM YYYY')

/** In words: "from the first instalment (Sep 2026)", "from Nov 2026". */
export function minPayFromWords(from: string | null | undefined, firstDueYM: string | null): string {
  if (from) return `from ${monthShort(from.slice(0, 7))}`
  return firstDueYM ? `from the first instalment (${monthShort(firstDueYM)})` : 'from the first instalment'
}

/** A form's choice in words for its summary — null while it is not whole. */
export function minPayChoiceWords(v: MinPayFrom, firstDueYM: string | null, laterMonths: readonly string[]): string | null {
  if (minPayFromMissing(v, laterMonths)) return null
  return v.choice === 'later' ? `From ${monthShort(v.month)}` : `From the first instalment${firstDueYM ? ` — ${monthShort(firstDueYM)}` : ''}`
}
