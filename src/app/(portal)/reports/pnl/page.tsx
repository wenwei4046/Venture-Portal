import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import dayjs from 'dayjs'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function PnLPage({ searchParams }: Props) {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { period: rawPeriod } = await searchParams
  const period = dayjs(rawPeriod ?? getPeriodMonth()).startOf('month').format('YYYY-MM-DD')
  const periodLabel = dayjs(period).format('MMMM YYYY')

  // Fetch revenue data
  const [
    { data: loanInterest },
    { data: penalties },
    { data: invoices },
    { data: hvFund },
    { data: directorPayouts },
    { data: fundSources },
  ] = await Promise.all([
    // Loan interest income (active loans × effective_rate × outstanding)
    supabase.from('loans').select('principal, effective_rate').eq('status', 'active'),
    // Overdue penalty income
    supabase.from('overdue_records').select('penalty_amount').eq('period_month', period),
    // Billing invoices by mode
    supabase.from('invoices').select('billing_mode, total_amount').eq('period_month', period).in('status', ['issued', 'paid']),
    // HV Operating Fund transactions
    supabase.from('hv_operating_fund').select('transaction_type, amount'),
    // Director payouts for this period
    supabase.rpc('get_director_payout_summary', { p_period: period }),
    // Savings interest expense
    supabase.from('fund_sources').select('amount, cost_rate').eq('status', 'active'),
  ])

  // Calculate revenue
  const loanInterestIncome = (loanInterest ?? []).reduce(
    (s, l) => s + Number(l.principal) * Number(l.effective_rate), 0
  )
  const penaltyIncome = (penalties ?? []).reduce((s, p) => s + Number(p.penalty_amount ?? 0), 0)

  const invoiceByMode = (mode: string) =>
    (invoices ?? []).filter(i => i.billing_mode === mode).reduce((s, i) => s + Number(i.total_amount ?? 0), 0)

  const hrBilling = invoiceByMode('hr_pool_split')
  const financeBilling = invoiceByMode('finance_attribution') + invoiceByMode('finance_mgmt_fee')
  const marketingBilling = invoiceByMode('marketing_project')
  const rentBillback = invoiceByMode('fixed_split') // includes both rent and utility

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dirSummary = (directorPayouts as any)?.[0]
  const savingIncome = Number(dirSummary?.out_total_saving ?? 0)
  const surplusIncome = Math.max(0, Number(dirSummary?.out_total_statutory_surplus ?? 0))

  const totalRevenue = loanInterestIncome + penaltyIncome + hrBilling + financeBilling +
    marketingBilling + rentBillback + savingIncome + surplusIncome

  // Calculate expenses
  const savingsInterestExpense = (fundSources ?? []).reduce(
    (s, f) => s + Number(f.amount) * Number(f.cost_rate), 0
  )
  const dirPayrollExpense = Number(dirSummary?.out_total_payroll_gross ?? 0) +
    Number(dirSummary?.out_total_epf_er ?? 0) + Number(dirSummary?.out_total_socso_er ?? 0) +
    Number(dirSummary?.out_total_eis_er ?? 0)
  const dirInvoiceExpense = Number(dirSummary?.out_total_invoice ?? 0)
  const dirAdvanceExpense = Number(dirSummary?.out_total_advance ?? 0)
  const deficitExpense = Math.abs(Math.min(0, Number(dirSummary?.out_total_statutory_surplus ?? 0)))

  const totalExpenses = savingsInterestExpense + dirPayrollExpense + dirInvoiceExpense +
    dirAdvanceExpense + deficitExpense

  const netProfit = totalRevenue - totalExpenses

  const revenueLines = [
    { label: 'Loan Interest Income', amount: loanInterestIncome },
    { label: 'Overdue Penalty Income', amount: penaltyIncome },
    { label: 'HR Billing', amount: hrBilling },
    { label: 'Finance Billing', amount: financeBilling },
    { label: 'Marketing Billing', amount: marketingBilling },
    { label: 'Rent & Utility Bill Back', amount: rentBillback },
    { label: 'Director 5% Saving', amount: savingIncome },
    { label: 'Statutory Surplus', amount: surplusIncome },
  ]

  const expenseLines = [
    { label: 'Savings Interest to Subs', amount: savingsInterestExpense },
    { label: 'Director Payroll (75% total cost)', amount: dirPayrollExpense },
    { label: 'Director Invoice (25% pool)', amount: dirInvoiceExpense },
    { label: 'Director Advance', amount: dirAdvanceExpense },
    { label: 'Statutory Deficit', amount: deficitExpense },
  ]

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="flex items-baseline justify-between mt-6 mb-10">
        <div>
          <h1 className="font-serif text-3xl text-ink">HV Profit & Loss</h1>
          <p className="font-serif italic text-graphite text-base mt-2">{periodLabel}</p>
        </div>
        <form>
          <input
            type="month"
            name="period"
            defaultValue={dayjs(period).format('YYYY-MM')}
            className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
          />
        </form>
      </div>

      <div className="max-w-3xl">
        {/* REVENUE */}
        <section className="mb-8">
          <h2 className="font-sans text-xs uppercase tracking-wide text-ledger font-semibold mb-4">Revenue</h2>
          <div className="space-y-2">
            {revenueLines.map(l => (
              <div key={l.label} className="flex items-baseline justify-between">
                <span className="font-serif text-sm text-graphite">{l.label}</span>
                <span className="font-mono tabular text-sm font-medium text-ink">{formatMoney(l.amount)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-baseline justify-between pt-3 mt-3 border-t border-hairline">
            <span className="font-serif italic text-sm text-ink font-semibold">Total Revenue</span>
            <span className="font-mono tabular text-md font-medium text-ledger font-semibold">{formatMoney(totalRevenue)}</span>
          </div>
        </section>

        {/* EXPENSES */}
        <section className="mb-8">
          <h2 className="font-sans text-xs uppercase tracking-wide text-danger font-semibold mb-4">Expenses</h2>
          <div className="space-y-2">
            {expenseLines.map(l => (
              <div key={l.label} className="flex items-baseline justify-between">
                <span className="font-serif text-sm text-graphite">{l.label}</span>
                <span className="font-mono tabular text-sm font-medium text-ink">({formatMoney(l.amount).replace('RM ', '')})</span>
              </div>
            ))}
          </div>
          <div className="flex items-baseline justify-between pt-3 mt-3 border-t border-hairline">
            <span className="font-serif italic text-sm text-ink font-semibold">Total Expenses</span>
            <span className="font-mono tabular text-md font-medium text-danger font-semibold">({formatMoney(totalExpenses).replace('RM ', '')})</span>
          </div>
        </section>

        {/* NET PROFIT */}
        <div className="border-t-2 border-hairline pt-6">
          <div className="flex items-baseline justify-between">
            <span className="font-serif text-2xl text-ink">Net Profit</span>
            <span className={`font-serif text-2xl font-semibold ${netProfit >= 0 ? 'text-ledger' : 'text-danger'}`}>
              {netProfit >= 0 ? formatMoney(netProfit) : `(${formatMoney(Math.abs(netProfit)).replace('RM ', '')})`}
            </span>
          </div>
          {dirSummary?.out_status === 'no_data' && (
            <p className="font-serif italic text-muted text-sm mt-2">(pending) — Director salary not yet calculated for this period.</p>
          )}
        </div>
      </div>
    </div>
  )
}
