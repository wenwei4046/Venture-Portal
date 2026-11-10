/**
 * The payroll month HR picks when approving a member claim into payroll
 * (2026-11-10, the user, on RQ-2611-020 — an Other claim for the fair of
 * 30 Oct – 1 Nov approved into the Nov 2026 payroll: "HR 要算进oct payroll 的").
 *
 * *Automatic* (the empty value) sends no month: the database works it out as
 * before — the month the claim is FOR (`member_claim_own_month`: a food claim's
 * month, else its brand week's month, else the month it was sent), moved on to
 * the next month still open. A picked month is used exactly, or the approval is
 * refused with the reason (`member_review_claim`, mig `20261110240000`).
 */

export const AUTOMATIC_MONTH = ''

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 'YYYY-MM' → 'Oct 2026' (three letters — DESIGN.md › Date format). */
export function monthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(month)
  if (!m) return month
  return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`
}

function shift(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  const index = y * 12 + (m - 1) + by
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

/**
 * The month a claim is for — the TS twin of `member_claim_own_month`: a food
 * claim's `month`, else the month of its brand week (`week`, the Friday), else
 * the office month it was sent in ('YYYY-MM-DD' of the office's day).
 */
export function claimOwnMonth(detail: Record<string, unknown>, sentDay: string): string {
  const month = typeof detail.month === 'string' ? detail.month : ''
  if (detail.claimType === 'food' && /^\d{4}-\d{2}$/.test(month)) return month
  const week = typeof detail.week === 'string' ? detail.week : ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(week)) return week.slice(0, 7)
  return sentDay.slice(0, 7)
}

/**
 * What the picker offers: *Automatic · {the month it is for}* first, then the
 * three months before the office's month, the office's month and the next —
 * oldest first. A month that can no longer take pay is refused by the database
 * with its reason; this list does not guess which.
 */
export function claimMonthChoices(officeMonth: string, ownMonth: string): { value: string; label: string }[] {
  const months = [-3, -2, -1, 0, 1].map(by => shift(officeMonth, by))
  return [
    { value: AUTOMATIC_MONTH, label: `Automatic · ${monthLabel(ownMonth)}` },
    ...months.map(value => ({ value, label: monthLabel(value) })),
  ]
}

/** The toast once approved. */
export function claimApprovedDone(month: string): string {
  return month ? `Claim approved — added to the ${monthLabel(month)} payroll` : 'Claim approved — added to payroll'
}
