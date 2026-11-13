import { formatMoney } from '@/lib/utils'
import { fullDay } from '@/components/finv/FullParts'
import type { RepaymentPlan } from '@/lib/repayment-plan'

// Print schedule's terms, in two columns over the instalments (2026-10-16 —
// lifted out of the loan's and the fund source's full pages word for word, so
// the Finance phone app's deal prints the same sheet): who it is with, the
// principal, the rate, the instalments, the first and its amount, the
// interest, what is paid, what is outstanding and the principal owed.

/**
 * What is owed now, all of it (2026-11-13 — the user: "有办法看到我 total 还有还多少吗"): a 利滚利 deal's whole balance
 * (rolled into); else — and a 利滚利 deal paid along the way, its money on the oldest interest first — the principal still
 * owed and the interest already due but unpaid. Every instalment paid: nothing (what the rate's rounding leaves over is
 * not a debt). The schedule's Owed now card and the printed sheet's Total owed read it here.
 */
export function owedNowOf(plan: RepaymentPlan): { total: number; principal: number; interest: number; rolled: boolean } {
  const r2 = (n: number) => Math.round(n * 100) / 100
  const c = plan.compound
  if (c && !c.interestFirst) return { total: c.owedNow, principal: plan.principalOwed, interest: r2(Math.max(0, c.owedNow - plan.principalOwed)), rolled: true }
  const paidUp = plan.rows.length > 0 && plan.rows.every((r) => r.outstanding <= 0.005) && plan.principalOwed <= 0.005
  const interest = paidUp ? 0 : r2(Math.max(0, plan.rows.filter((r) => !plan.next || r.due < plan.next.due).reduce((s, r) => s + r.interest, 0) - plan.interestPaid))
  return { total: r2(plan.principalOwed + interest), principal: plan.principalOwed, interest, rolled: false }
}

export function scheduleMeta(party: { label: string; value: string }, principal: number, rate: string, plan: RepaymentPlan): Array<{ label: string; value: string }> {
  return [
    party,
    { label: 'Principal', value: formatMoney(principal) },
    { label: 'Rate', value: rate },
    { label: 'Installments', value: plan.months ? String(plan.months) : 'No fixed term' },
    { label: 'First installment', value: plan.firstDue ? fullDay(plan.firstDue) : '—' },
    { label: 'Installment', value: formatMoney(plan.firstInstallment) },
    { label: 'Total interest', value: `${formatMoney(plan.totalInterest)}${plan.kind === 'open' ? ' (to date)' : ''}` },
    { label: 'Paid', value: formatMoney(plan.principalPaid + plan.interestPaid) },
    { label: 'Outstanding', value: formatMoney(plan.kind === 'open' ? plan.principalOwed : plan.outstandingDue) },
    { label: 'Principal owed', value: formatMoney(plan.principalOwed) },
    { label: 'Total owed', value: formatMoney(owedNowOf(plan).total) },
  ]
}

/** "Printed 16 Oct 2026 · Finance Manager" — the sheet's corner. */
export const printedLine = (today: string, name: string | null | undefined) => `Printed ${fullDay(today)} · ${name ?? 'Finance'}`
