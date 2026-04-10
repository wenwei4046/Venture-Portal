import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney, getPeriodMonth } from '@/lib/utils'
import dayjs from 'dayjs'
import quarterOfYear from 'dayjs/plugin/quarterOfYear'
import Link from 'next/link'
import PnLChart from './_components/PnLChart'

dayjs.extend(quarterOfYear)

type ViewMode = 'monthly' | 'quarterly' | 'yearly'

interface Props {
  searchParams: Promise<{ period?: string; view?: string }>
}

function getPeriodRange(period: string, view: ViewMode): { from: string; to: string; label: string } {
  const d = dayjs(period)
  if (view === 'quarterly') {
    const qStart = d.startOf('quarter')
    const qEnd = qStart.add(2, 'month').endOf('month')
    return {
      from: qStart.format('YYYY-MM-DD'),
      to: qEnd.startOf('month').format('YYYY-MM-DD'),
      label: `Q${d.quarter()} ${d.year()}`,
    }
  }
  if (view === 'yearly') {
    return {
      from: d.startOf('year').format('YYYY-MM-DD'),
      to: d.endOf('year').startOf('month').format('YYYY-MM-DD'),
      label: `${d.year()}`,
    }
  }
  return {
    from: d.startOf('month').format('YYYY-MM-DD'),
    to: d.startOf('month').format('YYYY-MM-DD'),
    label: d.format('MMMM YYYY'),
  }
}

function getMonthsInRange(from: string, to: string): string[] {
  const months: string[] = []
  let cur = dayjs(from)
  const end = dayjs(to)
  while (cur.isBefore(end) || cur.isSame(end, 'month')) {
    months.push(cur.format('YYYY-MM-DD'))
    cur = cur.add(1, 'month')
  }
  return months
}

export default async function PnLPage({ searchParams }: Props) {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { period: rawPeriod, view: rawView } = await searchParams
  const view: ViewMode = (rawView === 'quarterly' || rawView === 'yearly') ? rawView : 'monthly'
  const period = dayjs(rawPeriod ?? getPeriodMonth()).startOf('month').format('YYYY-MM-DD')
  const { from: periodFrom, to: periodTo, label: periodLabel } = getPeriodRange(period, view)
  const months = getMonthsInRange(periodFrom, periodTo)

  // Fetch revenue data (aggregate across all months in range)
  const [
    { data: loanInterest },
    { data: penalties },
    { data: invoices },
    {},
    { data: fundSources },
  ] = await Promise.all([
    // Loan interest income (active loans × effective_rate × outstanding)
    supabase.from('loans').select('principal, effective_rate').eq('status', 'active'),
    // Overdue penalty income (across period range)
    supabase.from('overdue_records').select('penalty_amount').gte('period_month', periodFrom).lte('period_month', periodTo),
    // Billing invoices by mode (across period range)
    supabase.from('invoices').select('billing_mode, total_amount').gte('period_month', periodFrom).lte('period_month', periodTo).in('status', ['issued', 'paid']),
    // HV Operating Fund transactions
    supabase.from('hv_operating_fund').select('transaction_type, amount'),
    // Savings interest expense
    supabase.from('fund_sources').select('amount, cost_rate').eq('status', 'active'),
  ])

  // Aggregate director payouts across all months in range (parallel)
  const dirSummaryAgg = { out_total_saving: 0, out_total_statutory_surplus: 0, out_total_payroll_gross: 0, out_total_epf_er: 0, out_total_socso_er: 0, out_total_eis_er: 0, out_total_invoice: 0, out_total_advance: 0, out_status: 'no_data' }
  const monthResults = await Promise.all(
    months.map(m => supabase.rpc('get_director_payout_summary', { p_period: m }))
  )
  for (const { data } of monthResults) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (data as any)?.[0]
    if (d && d.out_status !== 'no_data') {
      dirSummaryAgg.out_total_saving += Number(d.out_total_saving ?? 0)
      dirSummaryAgg.out_total_statutory_surplus += Number(d.out_total_statutory_surplus ?? 0)
      dirSummaryAgg.out_total_payroll_gross += Number(d.out_total_payroll_gross ?? 0)
      dirSummaryAgg.out_total_epf_er += Number(d.out_total_epf_er ?? 0)
      dirSummaryAgg.out_total_socso_er += Number(d.out_total_socso_er ?? 0)
      dirSummaryAgg.out_total_eis_er += Number(d.out_total_eis_er ?? 0)
      dirSummaryAgg.out_total_invoice += Number(d.out_total_invoice ?? 0)
      dirSummaryAgg.out_total_advance += Number(d.out_total_advance ?? 0)
      dirSummaryAgg.out_status = 'ok'
    }
  }

  // Calculate revenue
  const monthCount = months.length
  const loanInterestIncome = (loanInterest ?? []).reduce(
    (s, l) => s + Number(l.principal) * Number(l.effective_rate), 0
  ) * monthCount
  const penaltyIncome = (penalties ?? []).reduce((s, p) => s + Number(p.penalty_amount ?? 0), 0)

  const invoiceByMode = (mode: string) =>
    (invoices ?? []).filter(i => i.billing_mode === mode).reduce((s, i) => s + Number(i.total_amount ?? 0), 0)

  const hrBilling = invoiceByMode('hr_pool_split')
  const financeBilling = invoiceByMode('finance_attribution') + invoiceByMode('finance_mgmt_fee')
  const marketingBilling = invoiceByMode('marketing_project')
  const rentBillback = invoiceByMode('fixed_split') // includes both rent and utility

  const savingIncome = dirSummaryAgg.out_total_saving
  const surplusIncome = Math.max(0, dirSummaryAgg.out_total_statutory_surplus)

  const totalRevenue = loanInterestIncome + penaltyIncome + hrBilling + financeBilling +
    marketingBilling + rentBillback + savingIncome + surplusIncome

  // Calculate expenses
  const savingsInterestExpense = (fundSources ?? []).reduce(
    (s, f) => s + Number(f.amount) * Number(f.cost_rate), 0
  ) * monthCount
  const dirPayrollExpense = dirSummaryAgg.out_total_payroll_gross +
    dirSummaryAgg.out_total_epf_er + dirSummaryAgg.out_total_socso_er +
    dirSummaryAgg.out_total_eis_er
  const dirInvoiceExpense = dirSummaryAgg.out_total_invoice
  const dirAdvanceExpense = dirSummaryAgg.out_total_advance
  const deficitExpense = Math.abs(Math.min(0, dirSummaryAgg.out_total_statutory_surplus))

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
        <div className="flex items-center gap-4">
          <div className="flex border border-hairline rounded-md overflow-hidden">
            {(['monthly', 'quarterly', 'yearly'] as const).map(v => (
              <a
                key={v}
                href={`/reports/pnl?period=${dayjs(period).format('YYYY-MM')}&view=${v}`}
                className={
                  view === v
                    ? 'px-3 py-1.5 text-xs font-serif italic bg-accent-bg text-accent'
                    : 'px-3 py-1.5 text-xs font-sans text-graphite hover:bg-surface-2'
                }
              >
                {v === 'monthly' ? 'Monthly' : v === 'quarterly' ? 'Quarterly' : 'Yearly'}
              </a>
            ))}
          </div>
          <form>
            <input
              type="month"
              name="period"
              defaultValue={dayjs(period).format('YYYY-MM')}
              className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
            />
            <input type="hidden" name="view" value={view} />
          </form>
        </div>
      </div>

      <div className="max-w-3xl">
        {/* REVENUE */}
        <section className="mb-8">
          <h2 className="font-sans text-xs uppercase tracking-wide text-ledger font-semibold mb-4">Revenue</h2>
          <div className="space-y-2">
            {revenueLines.map(l => (
              <div key={l.label} className="flex items-baseline justify-between">
                <span className="font-serif text-sm text-graphite">{l.label}</span>
                <span className="font-mono tabular text-sm text-ink">{formatMoney(l.amount)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-baseline justify-between pt-3 mt-3 border-t border-hairline">
            <span className="font-serif italic text-sm text-ink font-semibold">Total Revenue</span>
            <span className="font-mono tabular text-md text-ledger font-semibold">{formatMoney(totalRevenue)}</span>
          </div>
        </section>

        {/* EXPENSES */}
        <section className="mb-8">
          <h2 className="font-sans text-xs uppercase tracking-wide text-danger font-semibold mb-4">Expenses</h2>
          <div className="space-y-2">
            {expenseLines.map(l => (
              <div key={l.label} className="flex items-baseline justify-between">
                <span className="font-serif text-sm text-graphite">{l.label}</span>
                <span className="font-mono tabular text-sm text-ink">({formatMoney(l.amount).replace('RM ', '')})</span>
              </div>
            ))}
          </div>
          <div className="flex items-baseline justify-between pt-3 mt-3 border-t border-hairline">
            <span className="font-serif italic text-sm text-ink font-semibold">Total Expenses</span>
            <span className="font-mono tabular text-md text-danger font-semibold">({formatMoney(totalExpenses).replace('RM ', '')})</span>
          </div>
        </section>

        {/* Chart */}
        <PnLChart revenue={totalRevenue} expenses={totalExpenses} netProfit={netProfit} />

        {/* NET PROFIT */}
        <div className="border-t-2 border-hairline pt-6">
          <div className="flex items-baseline justify-between">
            <span className="font-serif text-2xl text-ink">Net Profit</span>
            <span className={`font-serif text-2xl font-semibold ${netProfit >= 0 ? 'text-ledger' : 'text-danger'}`}>
              {netProfit >= 0 ? formatMoney(netProfit) : `(${formatMoney(Math.abs(netProfit)).replace('RM ', '')})`}
            </span>
          </div>
          {dirSummaryAgg.out_status === 'no_data' && (
            <p className="font-serif italic text-muted text-sm mt-2">(pending) — Director salary not yet calculated for this period.</p>
          )}
        </div>
      </div>
    </div>
  )
}
