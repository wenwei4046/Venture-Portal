// Repayment type (2026-10-27 — the user: "本金支持每月固定金额或分几期，Amend terms 和新的 fund in / fund out 都一样"; the
// mockups principal-input-mockup.html and fund-forms-desktop-mockup.html, "照这个样稿做"): how a deal's principal is
// repaid — a fixed amount a month, over a number of months, or none — and what each works out to for the forms: the
// months and the last month's principal, the words under the box, and the schedule beside the form. The engine's own
// arithmetic in small (lib/treasury-terms: a fixed amount's months clear what is owed, the last month taking the rest;
// equal parts' last month takes the sen left over, as lib/repayment-plan). Pure.

import type { RepaymentChoice } from '@/lib/fund-amend'

export type { RepaymentChoice } from '@/lib/fund-amend'

/** The three choices, in the forms' order and words (the user's mockup). */
export const REPAYMENT_CHOICES: ReadonlyArray<{ value: RepaymentChoice; label: string; note: string }> = [
  { value: 'amount', label: 'A fixed amount a month', note: 'You type the principal due each month; the form works out how many months.' },
  { value: 'months', label: 'Over a number of months', note: 'You type how many months; the form works out the principal each month.' },
  { value: 'none', label: 'None — no fixed term', note: 'No principal falls due; only interest each month.' },
]

const r2 = (n: number) => Math.round(n * 100) / 100
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** `YYYY-MM` moved `n` months. */
export function addYM(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const i = y * 12 + (m - 1) + n
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
}

/** Whole months from `a` to `b` (`YYYY-MM`). */
export function monthsFromTo(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return (by - ay) * 12 + (bm - am)
}

/** `YYYY-MM` → "Jan 2026". */
export const ymShort = (ym: string): string => (/^\d{4}-\d{2}$/.test(ym) ? `${SHORT[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : ym)
/** `YYYY-MM` → "January 2026". */
export const ymLong = (ym: string): string => (/^\d{4}-\d{2}$/.test(ym) ? `${LONG[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : ym)

/** RM's figure with its commas and sen: 51,000.00. */
export const money = (n: number): string => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** A figure typed with or without its commas — NaN when blank or not a number. */
export function typedAmount(s: string): number {
  const t = s.replace(/[,\s]/g, '')
  return t === '' ? NaN : Number(t)
}

/** What a fixed amount a month or a number of months works out to on what is owed. */
export interface RepaymentPlan {
  /** The months the principal is repaid over. */
  months: number
  /** The principal each month… */
  perMonth: number
  /** …and the last month's: what is left. */
  last: number
}

export type RepaymentRead = { ok: true; plan: RepaymentPlan } | { ok: false; wait: string }

/** The box read: a fixed amount a month, or a number of months, on what is owed when the terms start. */
export function readRepayment(choice: 'amount' | 'months', typed: string, owed: number): RepaymentRead {
  if (!(owed > 0)) return { ok: false, wait: 'Fill in the amount first.' }
  if (choice === 'amount') {
    if (typed.trim() === '') return { ok: false, wait: 'Type the principal due each month.' }
    const a = typedAmount(typed)
    if (!(a > 0)) return { ok: false, wait: 'Type an amount above 0.' }
    const per = Math.min(r2(a), owed)
    const months = Math.max(1, Math.ceil(owed / per - 1e-9))
    if (months > 120) return { ok: false, wait: `At RM ${money(r2(a))} a month it takes ${months} months — the most is 120.` }
    return { ok: true, plan: { months, perMonth: per, last: r2(owed - per * (months - 1)) } }
  }
  if (typed.trim() === '') return { ok: false, wait: 'Type how many months.' }
  const m = /^\s*\d+\s*$/.test(typed) ? parseInt(typed, 10) : NaN
  if (!(m >= 1 && m <= 120)) return { ok: false, wait: 'Whole months, from 1 to 120.' }
  const per = r2(owed / m)
  return { ok: true, plan: { months: m, perMonth: per, last: r2(owed - per * (m - 1)) } }
}

/** Words with their bold parts — the forms draw `{ b }` strong. */
export type Words = Array<string | { b: string }>

/** The months of a schedule from `startYM`: "Jan 2026 – Sep 2026", or one month alone. */
const span = (startYM: string, a: number, b: number) => (a === b ? ymShort(addYM(startYM, a)) : `${ymShort(addYM(startYM, a))} – ${ymShort(addYM(startYM, b))}`)

/** The months the fixed term runs before it ends from `openFromYM` — null when it never reaches it. */
export function monthsBeforeOpen(plan: RepaymentPlan, startYM: string, openFromYM: string | null): number | null {
  if (!openFromYM) return null
  const k = monthsFromTo(startYM, openFromYM)
  return k >= 1 && k < plan.months ? k : null
}

/** What the box works out to, in words under it — and, when the fixed term would end after the plan clears, why that changes nothing. */
export function repaymentWords(choice: 'amount' | 'months', plan: RepaymentPlan, owed: number, startYM: string, openFromYM: string | null): { words: Words; late: string | null } {
  const { months: n, perMonth: per, last } = plan
  const end = ymShort(addYM(startYM, n - 1))
  const lead: Words = choice === 'amount' ? [`RM ${money(per)} a month`] : [{ b: `RM ${money(per)} a month` }, ` (RM ${money(owed)} ÷ ${n})`]
  const k = monthsBeforeOpen(plan, startYM, openFromYM)
  const late = openFromYM && k === null && monthsFromTo(startYM, openFromYM) >= n ? `Cleared by ${end}, before ${ymShort(openFromYM)} — so “No fixed term from” changes nothing.` : null
  if (k !== null) {
    return {
      words: [...lead, `, ${span(startYM, 0, k - 1)} — `, { b: `${k} ${k === 1 ? 'month' : 'months'}` }, '. From ', { b: ymShort(openFromYM!) }, ' no principal falls due; ', { b: `RM ${money(r2(owed - per * k))}` }, ' is still owed then, with no fixed term.'],
      late: null,
    }
  }
  if (choice === 'amount') {
    if (n === 1) return { words: [`All RM ${money(owed)} falls due in `, { b: ymShort(startYM) }, '.'], late }
    if (last === per) return { words: [{ b: `${n} months` }, ` to clear RM ${money(owed)} — the last in `, { b: end }, '.'], late }
    return { words: [{ b: `${n - 1} × RM ${money(per)}` }, ', then ', { b: `RM ${money(last)}` }, ' in ', { b: end }, ` — ${n} months to clear RM ${money(owed)}.`], late }
  }
  return { words: [...lead, ' — the last in ', { b: end }, last !== per ? `, which is RM ${money(last)} so it adds up to RM ${money(owed)}.` : '.'], late }
}

/** A row of the schedule beside the form. */
export interface PreviewRow {
  /** "Jan 2026 – Sep 2026", "From Oct 2026". */
  months: string
  principal: number | null
  interest: number | null
  due: number | null
  /** The last month, which takes what is left. */
  last?: boolean
}

/** The schedule the terms make from `startYM`: its rows and the line under them. */
export function previewRows(args: {
  choice: RepaymentChoice
  plan: RepaymentPlan | null
  startYM: string
  /** Interest a month; null when it compounds (worked out month by month) or the rate is not typed yet. */
  interest: number | null
  /** What the flat interest is on — said when the fixed term ends later. */
  interestBase: number | null
  openFromYM: string | null
}): { rows: PreviewRow[]; foot: string } {
  const { choice, plan, startYM, interest, openFromYM } = args
  const row = (months: string, principal: number | null, last = false): PreviewRow => ({
    months,
    principal,
    interest,
    due: principal == null && interest == null ? null : r2((principal ?? 0) + (interest ?? 0)),
    ...(last ? { last: true } : {}),
  })
  if (choice === 'none' || !plan) {
    return { rows: [row(`From ${ymShort(startYM)}`, null)], foot: 'No principal falls due; repay any amount, any time.' }
  }
  const k = monthsBeforeOpen(plan, startYM, openFromYM)
  if (k !== null) {
    const base = args.interestBase != null ? ` on RM ${money(args.interestBase)}` : ''
    return {
      rows: [row(span(startYM, 0, k - 1), plan.perMonth), row(`From ${ymShort(openFromYM!)}`, null)],
      foot: `Principal unpaid by its month counts as overdue up to ${ymShort(addYM(startYM, k - 1))}; from ${ymShort(openFromYM!)} only interest falls due, still${base}.`,
    }
  }
  const n = plan.months
  const rows =
    n === 1
      ? [row(ymShort(startYM), plan.last)]
      : plan.last === plan.perMonth
        ? [row(span(startYM, 0, n - 1), plan.perMonth)]
        : [row(span(startYM, 0, n - 2), plan.perMonth), row(ymShort(addYM(startYM, n - 1)), plan.last, true)]
  return { rows, foot: 'Principal unpaid by its month counts as overdue.' }
}

/** The repayment in a line, for a summary: "RM 2,500.00 × 12, Nov 2026 – Oct 2027". */
export function repaymentSummary(choice: RepaymentChoice, plan: RepaymentPlan | null, startYM: string): string {
  if (choice === 'none' || !plan) return 'No fixed term — interest only'
  const { months: n, perMonth: per, last } = plan
  const first = ymShort(startYM)
  const end = ymShort(addYM(startYM, n - 1))
  if (n === 1) return `All RM ${money(last)} in ${first}`
  if (choice === 'months') return `${n} months × RM ${money(per)}, ${first} – ${end}`
  return last === per ? `RM ${money(per)} × ${n}, ${first} – ${end}` : `${n - 1} × RM ${money(per)} + RM ${money(last)}, ${first} – ${end}`
}

/** The months a fixed term may end from: the month after the terms start, for five years. */
export function openFromChoices(startYM: string): string[] {
  return Array.from({ length: 60 }, (_, i) => addYM(startYM, i + 1))
}
