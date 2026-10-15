import { createClient } from '@/lib/supabase/server'
import { canDo } from '@/lib/permission-actions'
import { requirePermission, requirePage } from '@/lib/auth'
import { fetchAllRows } from '@/lib/paginate'
import { formatMoney } from '@/lib/utils'
import Link from 'next/link'
import dayjs from 'dayjs'
import FundPieChart from './_components/FundPieChart'

export default async function FundSummaryPage() {
  await requirePage('/reports/fund-summary')
  const user = await requirePermission('reports')
  // The files only for whoever may take them out — as the export route asks (2026-10-16).
  const canExport = canDo(user, 'reports', 'export')
  const supabase = await createClient()

  // Resolve cash account codes for the Venture Pool computation.
  const { data: bankCodesData } = await supabase
    .from('bank_accounts')
    .select('gl_account_code')
    .eq('status', 'active')
  const cashCodes = (bankCodesData ?? [])
    .map((b) => b.gl_account_code as string)
    .filter(Boolean)

  const [
    { data: fundSources },
    { data: loans },
    { data: corpBankLines },
    { data: invoicePoolTxns },
    { data: deptPoolTxns },
  ] = await Promise.all([
    fetchAllRows((lo, hi) => supabase.from('fund_sources').select('*').eq('status', 'active').order('effective_date').order('id', { ascending: true }).range(lo, hi)).then((data) => ({ data })),
    fetchAllRows((lo, hi) => supabase.from('loans').select('principal, status').eq('status', 'active').order('id', { ascending: true }).range(lo, hi)).then((data) => ({ data })),
    // Venture Pool: corporate-segment journal_lines on HV bank accounts
    // (matches /dept-pool Venture row + dashboard hv_fund_balance per mig 272).
    // Legacy venture_pool table is empty per 2026-05-26 bank-recon decision.
    cashCodes.length > 0
      ? fetchAllRows((lo, hi) => supabase
          .from('journal_lines')
          .select('debit, credit, journal_entries!inner(segment, is_reversed)')
          .in('account_code', cashCodes)
          .in('journal_entries.segment', ['corporate', 'treasury'])
          // Net-only here, so void pairs cancelled out anyway — excluded for
          // consistency with every other report (user 2026-09-10).
          .eq('journal_entries.is_reversed', false)
          .order('id', { ascending: true })
          .range(lo, hi)).then((data) => ({ data }))
      : Promise.resolve({ data: [] }),
    fetchAllRows((lo, hi) => supabase.from('invoice_payout_pool').select('transaction_type, amount').order('id', { ascending: true }).range(lo, hi)).then((data) => ({ data })),
    fetchAllRows((lo, hi) => supabase.from('dept_pools').select('transaction_type, amount').order('id', { ascending: true }).range(lo, hi)).then((data) => ({ data })),
  ])

  // Paid Capital
  const totalPaid = (fundSources ?? []).reduce((s, f) => s + Number(f.amount), 0)
  const weightedCost = totalPaid > 0
    ? (fundSources ?? []).reduce((s, f) => s + Number(f.amount) * Number(f.cost_rate), 0) / totalPaid
    : 0

  // Venture Pool balance = Σ (debit − credit) on bank accounts tagged corporate.
  let hvFundBalance = 0
  for (const l of corpBankLines ?? []) {
    hvFundBalance += Number(l.debit ?? 0) - Number(l.credit ?? 0)
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
        <div className="flex gap-2">
          {canExport ? (
            <Link
              href="/reports/fund-summary/export?format=xlsx"
              className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
            >
              Export Excel
            </Link>
          ) : null}
          {canExport ? (
            <Link
              href="/reports/fund-summary/export?format=pdf"
              className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
            >
              Export PDF
            </Link>
          ) : null}
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
