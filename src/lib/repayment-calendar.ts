// The Repayment Schedule's calendar (2026-10-09, the user's Claude Design
// handoff) reads each deal's repayment plan (lib/repayment-plan): the month's
// installments become its entries, standing as paid (nothing left on it),
// part paid (some of it in), overdue (nothing in and its day gone) or due.
// One paid before its month — paid ahead, or a deal settled early — is no
// entry (2026-11-02, the user: 已经settle 了就别出现哦 → 还了要显示，只是像那种
// 提早settle 了就不要显示 → b, "提前预付的期数也算").

import type { RepaymentPlan } from './repayment-plan'

export interface CalendarDeal {
  kind: 'collect' | 'pay'
  name: string
  href: string
  /** Monthly rate, decimal. */
  rate: number
  principal: number
  /** The loan's or fund source's id — the We collect / We pay list joins its rows by it. */
  id?: string
}

export interface CalendarEntry extends CalendarDeal {
  date: string
  amount: number
  outstanding: number
  status: 'paid' | 'due' | 'partial' | 'overdue'
  no: number
  months: number | null
  /** The instalment's own principal and interest (2026-11-04, the monthly list). */
  instPrincipal: number
  instInterest: number
  /** What came in (or went out) against it. */
  paid: number
  /** YYYY-MM-DD — the day the payment that completed it came; null while something is still owed on it. */
  paidOn: string | null
  /** A compounding month's unpaid interest, rolled into the balance (a past month only). */
  rolled: number
}

/**
 * A deal already repaid (2026-11-13 — the user chose "页面不显示（数据不改）"): its instalments still owing something —
 * interest its terms ask that was never recorded — are not shown as owed; what it paid still is. The deal's own page
 * and its terms are unchanged.
 */
export function shownForStatus(entries: CalendarEntry[], status: string | null | undefined): CalendarEntry[] {
  return status === 'fully_repaid' || status === 'repaid' ? entries.filter((e) => e.outstanding <= 0.005) : entries
}

/** A row paid in full before its own month began — paid ahead, or settled early with the deal. */
const paidAhead = (r: RepaymentPlan['rows'][number]) => r.outstanding <= 0.005 && !!r.paidOn && r.paidOn.slice(0, 7) < r.ym

export function monthEvents(plan: RepaymentPlan, deal: CalendarDeal, month: string, today: string): CalendarEntry[] {
  return entriesOf(
    plan,
    deal,
    today,
    // A month with nothing to pay — an interest-free deal with no fixed term —
    // is no entry (2026-10-12, user: 把0.00拿掉); nor is one paid before its month
    // (2026-11-02): CONTS's 300,000, repaid in full by 26 Oct 2026, and HC's
    // 300,000, paid 35 instalments ahead on 5 Aug 2026, had stood on November's
    // 1st, green, 10,000.13 each. Paid in its month or after, it stays — paid.
    (r) => r.ym === month && r.installment > 0.005 && !paidAhead(r),
  )
}

/** The instalments of earlier months still owed in cash (2026-11-04, the monthly list): a payment clears the oldest
 *  instalment first, so money that came in this month may have gone to one of these, and this month's own row reads
 *  unpaid — the list of the office's month shows them too, overdue, or it would say nothing is late. A compounding
 *  month's unpaid interest rolled into the balance and is no arrear. */
export function arrearsBefore(plan: RepaymentPlan, deal: CalendarDeal, month: string, today: string): CalendarEntry[] {
  return entriesOf(plan, deal, today, (r) => r.ym < month && r.installment > 0.005 && r.outstanding > 0.005 && (r.toBalance ?? 0) <= 0.005)
}

function entriesOf(plan: RepaymentPlan, deal: CalendarDeal, today: string, keep: (r: RepaymentPlan['rows'][number]) => boolean): CalendarEntry[] {
  return plan.rows
    .filter(keep)
    .map((r) => ({
      ...deal,
      date: r.due,
      amount: r.installment,
      outstanding: r.outstanding,
      status: r.outstanding <= 0.005 ? 'paid' : r.outstanding < r.installment - 0.005 ? 'partial' : r.due < today ? 'overdue' : 'due',
      no: r.no,
      months: plan.months,
      instPrincipal: r.principal ?? 0,
      instInterest: r.interest,
      paid: Math.max(0, Math.round(((r.paid ?? r.installment - r.outstanding - (r.toBalance ?? 0)) + Number.EPSILON) * 100) / 100),
      paidOn: r.paidOn ?? null,
      rolled: r.toBalance ?? 0,
    }))
}

export interface OverdueSummary {
  /** What is unpaid on the installments whose day has passed. */
  outstanding: number
  oldestDue: string
  oldestNo: number
  /** Days since the oldest of them fell due. */
  daysPast: number
  count: number
}

/** A deal's overdue (the Overdue page's Fund IN tab, 2026-10-09): the
 *  installments whose day has passed with something still unpaid on them. */
export function overdueOf(plan: RepaymentPlan, today: string): OverdueSummary | null {
  const late = plan.rows.filter((r) => r.due < today && r.outstanding > 0.005)
  if (late.length === 0) return null
  const oldest = late[0]
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${oldest.due}T00:00:00Z`)) / 86_400_000)
  return {
    outstanding: Math.round(late.reduce((s, r) => s + r.outstanding, 0) * 100) / 100,
    oldestDue: oldest.due,
    oldestNo: oldest.no,
    daysPast: days,
    count: late.length,
  }
}
