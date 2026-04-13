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
    { data: config },
  ] = await Promise.all([
    supabase.from('fund_sources').select('*').eq('status', 'active').order('effective_date'),
    supabase.from('loans').select('principal, status').eq('status', 'active'),
    supabase.from('hv_operating_fund').select('transaction_type, amount'),
    supabase.from('invoice_payout_pool').select('transaction_type, amount'),
    supabase.from('dept_pools').select('transaction_type, amount'),
    supabase.from('treasury_config').select('config_key, config_value').eq('config_key', 'buffer_amount').maybeSingle(),
  ])

  // Paid Capital
  const totalPaid = (fundSources ?? []).reduce((s, f) => s + Number(f.amount), 0)
  const weightedCost = totalPaid > 0
    ? (fundSources ?? []).reduce((s, f) => s + Number(f.amount) * Number(f.cost_rate), 0) / totalPaid
    : 0

  // Free Capital
  let hvFundBalance = 0
  for (const t of hvFundTxns ?? []) {
    const isIn = ['saving_in', 'surplus_in', 'profit_in', 'fund_in', 'loan_repayment_in'].includes(t.transaction_type)
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

  // Allocated
  const loansOutstanding = (loans ?? []).reduce((s, l) => s + Number(l.principal), 0)
  const bufferAmount = config?.config_value ? Number(config.config_value) : 50000

  const totalFree = hvFundBalance + deptPoolBalance
  const totalAllocated = loansOutstanding + bufferAmount + invoicePoolBalance
  const freeCash = totalPaid + totalFree - totalAllocated

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="mt-6 mb-10">
        <h1 className="font-serif text-3xl text-ink">Fund Summary</h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          Capital structure. <em>As of {dayjs().format('D MMM YYYY')}.</em>
        </p>
      </div>

      <div className="max-w-3xl space-y-8">
        {/* Paid Capital */}
        <section>
          <h2 className="font-sans text-xs uppercase tracking-wide text-muted font-semibold mb-4">Paid Capital</h2>
          {(fundSources ?? []).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                    <th className="text-left py-3 pr-4 font-medium">Source</th>
                    <th className="text-right py-3 pr-4 font-medium">Amount</th>
                    <th className="text-right py-3 pr-4 font-medium">Rate</th>
                    <th className="text-right py-3 pr-4 font-medium">Maturity</th>
                  </tr>
                </thead>
                <tbody>
                  {(fundSources ?? []).map(f => (
                    <tr key={f.id} className="border-b border-hairline last:border-0">
                      <td className="py-3 pr-4 font-serif text-md text-ink">{f.source_type === 'director_loan' ? 'Director Loan' : 'Subsidiary Savings'}</td>
                      <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink">{formatMoney(f.amount)}</td>
                      <td className="py-3 pr-4 text-right font-mono tabular font-medium text-graphite">{(Number(f.cost_rate) * 100).toFixed(3)}%</td>
                      <td className="py-3 pr-4 text-right font-mono text-xs text-muted">{f.maturity_date ? dayjs(f.maturity_date).format('D MMM YYYY') : '—'}</td>
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
            <span className="font-mono tabular text-md font-medium text-ink font-semibold">{formatMoney(totalPaid)}</span>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-serif italic text-sm text-graphite">Weighted Cost</span>
            <span className="font-mono tabular text-sm font-medium text-graphite">{(weightedCost * 100).toFixed(3)}%/mo</span>
          </div>
        </section>

        {/* Free Capital */}
        <section>
          <h2 className="font-sans text-xs uppercase tracking-wide text-muted font-semibold mb-4">Free Capital</h2>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-sm text-graphite">HV Operating Fund</span>
              <span className="font-mono tabular text-sm font-medium text-ink">{formatMoney(hvFundBalance)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-sm text-graphite">Dept Pool (Marketing)</span>
              <span className="font-mono tabular text-sm font-medium text-ink">{formatMoney(deptPoolBalance)}</span>
            </div>
          </div>
          <div className="flex items-baseline justify-between pt-3 mt-3 border-t border-hairline">
            <span className="font-serif italic text-sm text-ink">Total Free</span>
            <span className="font-mono tabular text-md font-medium text-ink font-semibold">{formatMoney(totalFree)}</span>
          </div>
        </section>

        {/* Allocated */}
        <section>
          <h2 className="font-sans text-xs uppercase tracking-wide text-muted font-semibold mb-4">Allocated</h2>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-sm text-graphite">Loans Outstanding</span>
              <span className="font-mono tabular text-sm font-medium text-ink">{formatMoney(loansOutstanding)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-sm text-graphite">Buffer</span>
              <span className="font-mono tabular text-sm font-medium text-ink">{formatMoney(bufferAmount)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-serif text-sm text-graphite">Invoice Payout Pool</span>
              <span className="font-mono tabular text-sm font-medium text-ink">{formatMoney(invoicePoolBalance)}</span>
            </div>
          </div>
        </section>

        {/* Fund Allocation Chart */}
        <section>
          <h2 className="font-sans text-xs uppercase tracking-wide text-muted font-semibold mb-4">Fund Allocation</h2>
          <FundPieChart
            slices={[
              { name: 'Loans Outstanding', value: loansOutstanding },
              { name: 'Buffer', value: bufferAmount },
              { name: 'Invoice Pool', value: invoicePoolBalance },
              { name: 'HV Operating Fund', value: hvFundBalance },
              { name: 'Dept Pool', value: deptPoolBalance },
              { name: 'Free Cash', value: Math.max(0, freeCash) },
            ]}
          />
        </section>

        {/* Free Cash */}
        <div className="border-t-2 border-hairline pt-6">
          <div className="flex items-baseline justify-between">
            <span className="font-serif text-2xl text-ink">Free Cash</span>
            <span className={`font-serif text-2xl font-semibold ${freeCash >= 0 ? 'text-ledger' : 'text-danger'}`}>
              {formatMoney(freeCash)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
