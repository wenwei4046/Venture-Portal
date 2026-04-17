import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'

export default async function AlliancePoolPage() {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const [
    { data: balanceRows },
    { data: txns },
    { data: runs },
  ] = await Promise.all([
    supabase.from('alliance_bank_pool_balance').select('balance, txn_count, last_txn_at'),
    supabase
      .from('alliance_bank_pool')
      .select('id, transaction_type, amount, description, period_month, created_at, reference_type, reference_id')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('payroll_runs')
      .select('period_month, status, total_amount')
      .in('status', ['submitted', 'approved', 'paid'])
      .order('period_month', { ascending: false })
      .limit(5),
  ])

  const balance = Number(balanceRows?.[0]?.balance ?? 0)
  const txnCount = balanceRows?.[0]?.txn_count ?? 0
  const lastTxn = balanceRows?.[0]?.last_txn_at

  const pendingRun = runs?.find(r => r.status === 'submitted')
  const shortfall = pendingRun
    ? Math.max(0, Number(pendingRun.total_amount) - balance)
    : 0

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-serif text-3xl text-ink">Alliance Bank Pool</h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          Isolated account for salary disbursement. Finance tops up from OPEX pools; Principal approves payroll which debits here.
        </p>
      </div>

      {/* Hero balance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-12 pb-12 border-b border-hairline">
        <div className="lg:col-span-7">
          <div className="font-serif italic text-accent text-base mb-1">Current Balance</div>
          <div className={`font-serif text-[44px] md:text-hero leading-none ${balance >= 0 ? 'text-ink' : 'text-danger'}`}>
            {formatMoney(balance)}
          </div>
          <div className="font-mono text-xs text-muted mt-2">
            {txnCount} {txnCount === 1 ? 'transaction' : 'transactions'}
            {lastTxn && (
              <span className="ml-3">
                last {new Date(lastTxn).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>

        {pendingRun && (
          <div className="lg:col-span-5">
            <div className={`border rounded-md p-5 ${shortfall > 0 ? 'border-danger bg-danger-surface' : 'border-success bg-surface'}`}>
              <div className="font-serif italic text-xs uppercase tracking-wide mb-1">
                Pending Payroll Run
              </div>
              <div className="font-serif text-md text-ink">
                {new Date(pendingRun.period_month + 'T00:00:00Z').toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
                {' — '}
                <span className="font-mono tabular">{formatMoney(Number(pendingRun.total_amount))}</span>
              </div>
              {shortfall > 0 ? (
                <div className="mt-2 font-serif italic text-danger text-sm">
                  Short by <strong className="font-mono tabular">{formatMoney(shortfall)}</strong>.
                  Transfer from OPEX pools before Principal can approve.
                </div>
              ) : (
                <div className="mt-2 font-serif italic text-success text-sm">
                  Balance covers this run — Principal can approve.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Transactions */}
      {!txns || txns.length === 0 ? (
        <div className="py-16 text-center border border-hairline rounded-md bg-surface">
          <p className="font-serif italic text-graphite text-lg mb-1">No transactions yet.</p>
          <p className="font-serif italic text-muted text-sm">
            Finance creates a <em>Transfer to Alliance</em> voucher to credit this pool before Principal approves payroll.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                <th className="text-left py-3 pr-4 font-medium">Date</th>
                <th className="text-left py-3 pr-4 font-medium">Type</th>
                <th className="text-left py-3 pr-4 font-medium">Description</th>
                <th className="text-right py-3 pr-4 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {txns.map(t => {
                const isIn = t.transaction_type === 'transfer_in' || t.transaction_type === 'adjustment'
                return (
                  <tr key={t.id} className="border-b border-hairline last:border-0 hover:bg-surface-2/40 transition-colors">
                    <td className="py-4 pr-4 font-mono text-xs text-muted">
                      {new Date(t.created_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-4 pr-4">
                      <em className={`font-serif text-sm ${isIn ? 'text-ledger' : 'text-danger'}`}>
                        {t.transaction_type.replace(/_/g, ' ')}
                      </em>
                    </td>
                    <td className="py-4 pr-4 font-sans text-sm text-graphite">{t.description}</td>
                    <td className={`py-4 pr-4 text-right font-mono tabular font-semibold ${isIn ? 'text-ledger' : 'text-danger'}`}>
                      {isIn ? '+' : '−'}{formatMoney(Number(t.amount))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-8">
        <Link
          href="/operating-fund"
          className="text-sm text-muted hover:text-accent font-sans transition-colors"
        >
          ← Operating Fund overview
        </Link>
      </div>
    </div>
  )
}
