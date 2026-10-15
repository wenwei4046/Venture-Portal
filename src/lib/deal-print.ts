import { formatMoney } from '@/lib/utils'
import { fullDay } from '@/components/finv/FullParts'
import type { RepaymentPlan } from '@/lib/repayment-plan'

// Print schedule's terms, in two columns over the instalments (2026-10-16 —
// lifted out of the loan's and the fund source's full pages word for word, so
// the Finance phone app's deal prints the same sheet): who it is with, the
// principal, the rate, the instalments, the first and its amount, the
// interest, what is paid, what is outstanding and the principal owed.

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
  ]
}

/** "Printed 16 Oct 2026 · Finance Manager" — the sheet's corner. */
export const printedLine = (today: string, name: string | null | undefined) => `Printed ${fullDay(today)} · ${name ?? 'Finance'}`
