// Interest in suspense, one account per deal (2026-11-13 — docs/superpowers/specs/2026-11-13-iis-per-deal-design.md;
// the user's method, memory iis-method-decided). Pure: what a deal puts into suspense and takes out of it, month by
// month — the same rules as the catch-up preview the user confirmed ("改损益的地方没有问题", "感觉是对的").
//
//   · Into suspense ("accrual"): a fixed, non-compounding terms segment puts all of its interest in at its start (a
//     later change takes the old terms' months not yet due out); a compounding or no-fixed-term segment puts each
//     month's interest in when it falls due.
//   · Out of suspense ("recognition"): the interest received (a loan) or paid (a fund source) — cash basis. A payment
//     the schedule sets against the oldest interest first (a no-fixed-term 利滚利 deal, #783) counts as interest
//     (the user 2026-11-13, LO#30).
//   · Not in suspense: 0% deals and the back-to-back LO#19 / BI#19.

import type { RepaymentPlan } from './repayment-plan'
import type { TermsSegment } from './treasury-terms'

/** The books begin at the opening JVs of 2026-03-28 / 29; a deal begun before is caught up from this day. */
export const IIS_BOOKS_BEGIN = '2026-03-31'
export const LOAN_INTEREST_INCOME = '5027'
export const FUND_INTEREST_EXPENSE = '6000'

export type IisKind = 'loan' | 'fund_source'

export interface IisPayment {
  /** YYYY-MM-DD */
  date: string
  /** principal / interest / penalty / netting */
  type: string
  amount: number
}

export interface IisDeal {
  kind: IisKind
  id: string
  /** A loan's disbursement, a fund source's effective date — YYYY-MM-DD. */
  start: string
  principal: number
  /** A loan's repayment terms, a fund source's notes. */
  words: string | null
  segments: readonly TermsSegment[]
  plan: Pick<RepaymentPlan, 'rows' | 'interestPaid'>
  payments: readonly IisPayment[]
}

export interface IisAccrual {
  date: string
  amount: number
  why: string
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const ymAdd = (ym: string, k: number) => {
  const [y, m] = ym.split('-').map(Number)
  const t = y * 12 + (m - 1) + k
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
const ymDiff = (a: string, b: string) => {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return by * 12 + bm - (ay * 12 + am)
}

/** The month's last day — YYYY-MM-DD. */
export function monthEndOf(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
}

/** The back-to-back pair kept off P&L (the user 2026-10-26). */
export const isPassThrough = (words: string | null | undefined) => /\[(LO|BI)#19\]/.test(words ?? '')

/** The deal bears interest and is not the back-to-back pair. */
export const inSuspense = (d: Pick<IisDeal, 'segments' | 'words'>) => d.segments.some((g) => g.rate > 0) && !isPassThrough(d.words)

/** Every amount the deal puts into suspense (taken out, when negative), by date, up to `today`'s due rows. */
export function accrualsOf(d: IisDeal, today: string): IisAccrual[] {
  if (!inSuspense(d)) return []
  const out: IisAccrual[] = []
  const segs = d.segments
  for (let i = 0; i < segs.length; i++) {
    const g = segs[i]
    const next = segs[i + 1]
    if (g.rate <= 0) continue
    const segStart = i === 0 ? d.start : `${g.fromYM}-01`
    const endYM = next ? ymAdd(next.fromYM, -1) : null
    if (g.months && !g.compounding) {
      out.push({ date: segStart, amount: r2(g.interestPerMonth * g.months), why: `Terms from ${g.fromYM}: ${(g.rate * 100).toFixed(3)}% × ${g.months} months, all of it` })
      if (next) {
        const left = Math.max(0, g.months - ymDiff(g.fromYM, next.fromYM))
        if (left > 0) out.push({ date: `${next.fromYM}-01`, amount: -r2(g.interestPerMonth * left), why: `Terms changed from ${next.fromYM}: the old terms' ${left} months not yet due taken out` })
      }
    } else {
      for (const row of d.plan.rows ?? []) {
        if (row.ym < g.fromYM || (endYM && row.ym > endYM)) continue
        if (row.due > today || !(row.interest > 0)) continue
        out.push({ date: row.due, amount: r2(row.interest), why: `${row.ym} interest falls due${g.compounding ? ' (compounding)' : ''}` })
      }
    }
  }
  return out
}

/** The interest received / paid, by date: interest-typed payments, and principal-typed ones the schedule sets against
 *  the oldest interest first, up to its own interest paid. */
export function interestPaymentsOf(d: IisDeal): Array<{ date: string; amount: number }> {
  if (!inSuspense(d)) return []
  const pays = [...d.payments].sort((a, b) => a.date.localeCompare(b.date))
  const recorded = pays.filter((p) => p.type === 'interest').reduce((t, p) => t + p.amount, 0)
  let toInterest = r2((d.plan.interestPaid ?? recorded) - recorded)
  const out: Array<{ date: string; amount: number }> = []
  for (const p of pays) {
    if (p.type === 'interest') out.push({ date: p.date, amount: r2(p.amount) })
    else if (p.type === 'principal' && toInterest > 0.004) {
      const k = r2(Math.min(p.amount, toInterest))
      toInterest = r2(toInterest - k)
      out.push({ date: p.date, amount: k })
    }
  }
  return out
}

/** What iis_postings already holds for a deal. */
export interface IisPosted {
  accrued: number
  /** 'YYYY-MM' → recognised that month. */
  recognized: Record<string, number>
}

/** What a month's run posts for a deal: what is still to go into suspense by its last day, and the interest received
 *  / paid that month not yet taken out. */
export function monthRunFor(d: IisDeal, ym: string, posted: IisPosted, today: string): { accrual: number; recognition: number } {
  if (!inSuspense(d)) return { accrual: 0, recognition: 0 }
  const end = monthEndOf(ym)
  const target = r2(accrualsOf(d, today).filter((a) => a.date <= end).reduce((t, a) => t + a.amount, 0))
  const received = r2(interestPaymentsOf(d).filter((p) => p.date.slice(0, 7) === ym).reduce((t, p) => t + p.amount, 0))
  return { accrual: r2(target - (posted.accrued ?? 0)), recognition: r2(received - (posted.recognized?.[ym] ?? 0)) }
}

export interface IisLine {
  account_code: string
  debit: number
  credit: number
  description: string
}

/** The month's entry for a deal: into suspense, then out of it to 5027 / 6000. */
export function monthLinesFor(kind: IisKind, accounts: { deal: string; iis: string }, accrual: number, recognition: number, label: string): IisLine[] {
  const lines: IisLine[] = []
  const line = (account_code: string, amt: number, description: string) =>
    lines.push({ account_code, debit: amt > 0 ? r2(amt) : 0, credit: amt < 0 ? r2(-amt) : 0, description })
  if (Math.abs(accrual) > 0.004) {
    // A loan: Dr the deal (owed to us) / Cr IIS. A fund source: Dr IIS / Cr the deal (owed by us).
    if (kind === 'loan') { line(accounts.deal, accrual, `Interest into suspense · ${label}`); line(accounts.iis, -accrual, `Interest into suspense · ${label}`) }
    else { line(accounts.iis, accrual, `Interest into suspense · ${label}`); line(accounts.deal, -accrual, `Interest into suspense · ${label}`) }
  }
  if (Math.abs(recognition) > 0.004) {
    if (kind === 'loan') { line(accounts.iis, recognition, `Interest received · ${label}`); line(LOAN_INTEREST_INCOME, -recognition, `Interest received · ${label}`) }
    else { line(FUND_INTEREST_EXPENSE, recognition, `Interest paid · ${label}`); line(accounts.iis, -recognition, `Interest paid · ${label}`) }
  }
  return lines
}

export interface IisMonthRow {
  kind: IisKind
  id: string
  label: string
  accrual: number
  recognition: number
  lines: IisLine[]
}

/** A month's run over the book: one entry a deal with something new. A month before the deal's latest accrual puts
 *  nothing more into suspense (that month is already counted) — only its interest received / paid comes out. */
export function planIisMonth(
  book: ReadonlyArray<{ deal: IisDeal; label: string; accounts: { deal: string; iis: string }; posted: IisPosted & { lastAccrual?: string | null } }>,
  ym: string,
  today: string,
): IisMonthRow[] {
  const out: IisMonthRow[] = []
  for (const b of book) {
    const run = monthRunFor(b.deal, ym, b.posted, today)
    const accrual = b.posted.lastAccrual && ym < b.posted.lastAccrual ? 0 : run.accrual
    const lines = monthLinesFor(b.deal.kind, b.accounts, accrual, run.recognition, b.label)
    if (lines.length) out.push({ kind: b.deal.kind, id: b.deal.id, label: b.label, accrual, recognition: run.recognition, lines })
  }
  return out
}
