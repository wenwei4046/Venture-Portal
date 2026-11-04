// A deal's rate per month or per year (2026-11-04 — the user: "有没有办法我也可以set annual的？" → A, annual ÷ 12, charged
// and compounded monthly; Fund OUT types the year's rate directly). The stored rate is ALWAYS the month's, kept to
// ten decimals (mig 20261104190000) so 10% a year ÷ 12 bears 1,000.00 on 120,000, not 999.96; `rate_basis` only says
// how it was agreed, for the words.

export type RateBasis = 'month' | 'year'

/** Decimals a stored rate keeps (`NUMERIC(14, 10)`). */
export const RATE_DECIMALS = 10

const round = (n: number, places: number) => {
  const f = 10 ** places
  return Math.round(n * f) / f
}

export const rateBasisOf = (v: unknown): RateBasis => (v === 'year' ? 'year' : 'month')

/** A percentage typed in its basis → the month's rate as a fraction, ten decimals. */
export function monthlyRateOf(percent: number, basis: RateBasis): number {
  return round(percent / 100 / (basis === 'year' ? 12 : 1), RATE_DECIMALS)
}

/** The month's rate as a percentage in the basis it was agreed in (10 for 10% a year), to four places. */
export function rateInBasis(monthly: number, basis: RateBasis): number {
  return round(monthly * 100 * (basis === 'year' ? 12 : 1), 4)
}

/** "10.000% /yr · 0.833% /mo", or "0.500% /mo". */
export function rateWords(monthly: number, basis: RateBasis): string {
  const mo = `${(monthly * 100).toFixed(3)}% /mo`
  return basis === 'year' ? `${(monthly * 1200).toFixed(3)}% /yr · ${mo}` : mo
}

/** The highest percentage a form may type in its basis (`rate_basis` on the form; a month under 100%). */
export const ratePctCap = (form: FormData): number => (rateBasisOf(form.get('rate_basis')) === 'year' ? 1200 : 100)
