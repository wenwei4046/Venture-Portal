import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import Link from 'next/link'
import dayjs from 'dayjs'
import FundPieChart from './_components/FundPieChart'

export default async function FundSummaryPage() {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const [
    { data: fundSources },
    { data: loans },
    { data: hvFundTxns },
    { data: invoicePoolTxns },
    { data: deptPoolTxns },
  ] = await Promise.all([
    supabase.from('fund_sources').select('*').eq('status', 'active').order('effective_date'),
    supabase.from('loans').select('principal, status').eq('status', 'active'),
    supabase.from('venture_pool').select('transaction_type, amount'),
    supabase.from('invoice_payout_pool').select('transaction_type, amount'),
    supabase.from('dept_pools').select('transaction_type, amount'),
  ])

  // Paid Capital
  const totalPaid = (fundSources ?? []).reduce((s, f) => s + Number(f.amount), 0)
  const weightedCost = totalPaid > 0
    ? (fundSources ?? []).reduce((s, f) => s + Number(f.amount) * Number(f.cost_rate), 0) / totalPaid
    : 0

  // Venture Pool balance (Phase 10 / mig 192 formula)
  let hvFundBalance = 0
  for (const t of hvFundTxns ?? []) {
    const isIn = ['fund_in', 'loan_repayment_in', 'profit_in'].includes(t.transaction_type)
    hvFundBalance += isIn ? Number(t.amount) : -Number(t.amount)
  }

  let deptPoolBalance = 0
  for (const t of deptPoolTxns ?? []) {
    deptPoolBalance += t.transaction_type === 'np_in' ? Number(t.amount) : -Number(t.amount)
  }

  let invoicePoolBalance = 0
  for (const t of invoicePoolTxns ?? []) {
    invoicePoolBalance += t.transaction_type === 'accumulate' ? Number(t.amount) : -Number(t.amount)
  }

  const loansOutstanding = (loans ?? []).reduce((s, l) => s + Number(l.principal), 0)

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · FUND SUMMARY
          </div>
          <h1 className="page-title">Fund Summary</h1>
        </div>
      </div>

      <div className="max-w-3xl space-y-8">
        {/* Paid Capital */}
        <section>
          <h2 className="font-sans text-xs uppercase tracking-wide text-muted font-semibold mb-4">Paid Capital</h2>
          {(fundSources ?? []).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th className="right">Amount</th>
                    <th className="right">Rate</th>
                    <th className="right">Maturity</th>
                  </tr>
                </thead>
                <tbody>
                  {(fundSources ?? []).map(f => (
                    <tr key={f.id}>
                      <td>
                        <div className="font-serif text-md text-ink">{
                          f.source_type === 'director_loan' ? 'Director Loan'
                            : f.source_type === 'outsource' ? 'Outsource'
                            : f.source_type === 'department_pool' ? 'Dept Pool'
                            : 'Subsidiary Savings'
                        }</div>
                      </td>
                      <td className="num">{formatMoney(f.amount)}</td>
                      <td className="num text-graphite">{(Number(f.cost_rate) * 100).toFixed(3)}%</td>
                      <td className="num text-muted">{f.maturity_date ? dayjs(f.maturity_date).format('D MMM YYYY') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="font-serif italic text-muted text-sm">No active fund sources.</p>
          )}
          <div className="flex items-baseline justify-between pt-3 mt-3 border-t border-hairline">
            <span className="font-serif italic text-sm text-ink">Total Paid</span>
            <span className="num text-num-ink font-semibold">{formatMoney(totalPaid)}</span>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-serif italic text-sm text-graphite">Weighted Cost</span>
            <span className="num text-graphite">{(weightedCost * 100).toFixed(3)}%/mo</span>
          </div>
        </section>

        {/* Free Capital */}
        <section>
          <h2 className="font-sans text-xs uppercase tracking-wide text-muted font-semibold mb-4">Free Capital</h2>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-sm text-graphite">Venture Pool</span>
              <span className="num">{formatMoney(hvFundBalance)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-sm text-graphite">Dept Pool (Marketing)</span>
              <span className="num">{formatMoney(deptPoolBalance)}</span>
            </div>
          </div>
          <div className="flex items-baseline justify-between pt-3 mt-3 border-t border-hairline">
            <span className="font-serif italic text-sm text-ink">Total Free</span>
            <span className="num text-num-ink font-semibold">{formatMoney(hvFundBalance + deptPoolBalance)}</span>
          </div>
        </section>

        {/* Allocated */}
        <section>
          <h2 className="font-sans text-xs uppercase tracking-wide text-muted font-semibold mb-4">Allocated</h2>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-sm text-graphite">Loans Outstanding</span>
              <span className="num">{formatMoney(loansOutstanding)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-sm text-graphite">Invoice Payout Pool</span>
              <span className="num">{formatMoney(invoicePoolBalance)}</span>
            </div>
          </div>
        </section>

        {/* Fund Allocation Chart */}
        <section>
          <h2 className="font-sans text-xs uppercase tracking-wide text-muted font-semibold mb-4">Fund Allocation</h2>
          <FundPieChart
            slices={[
              { name: 'Loans Outstanding', value: loansOutstanding },
              { name: 'Invoice Pool', value: invoicePoolBalance },
              { name: 'Venture Pool', value: hvFundBalance },
              { name: 'Dept Pool', value: deptPoolBalance },
            ]}
          />
        </section>
      </div>
    </div>
  )
}
