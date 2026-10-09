// The Repayment Schedule's calendar (2026-10-09, the user's Claude Design
// handoff) reads each deal's repayment plan (lib/repayment-plan): the month's
// installments become its entries, standing as paid (nothing left on it),
// part paid (some of it in), overdue (nothing in and its day gone) or due.

import type { RepaymentPlan } from './repayment-plan'

export interface CalendarDeal {
  kind: 'collect' | 'pay'
  name: string
  href: string
  /** Monthly rate, decimal. */
  rate: number
  principal: number
}

export interface CalendarEntry extends CalendarDeal {
  date: string
  amount: number
  outstanding: number
  status: 'paid' | 'due' | 'partial' | 'overdue'
  no: number
  months: number | null
}

export function monthEvents(plan: RepaymentPlan, deal: CalendarDeal, month: string, today: string): CalendarEntry[] {
  return plan.rows
    .filter((r) => r.ym === month)
    .map((r) => ({
      ...deal,
      date: r.due,
      amount: r.installment,
      outstanding: r.outstanding,
      status: r.outstanding <= 0.005 ? 'paid' : r.outstanding < r.installment - 0.005 ? 'partial' : r.due < today ? 'overdue' : 'due',
      no: r.no,
      months: plan.months,
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
