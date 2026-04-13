import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import dayjs from 'dayjs'

export default async function DirectorPoolPage() {
  await requireRole(['principal', 'hr', 'finance'])
  const supabase = await createClient()

  // Fetch both pools
  const [
    { data: savingTxns },
    { data: invoiceTxns },
    { data: claims },
  ] = await Promise.all([
    supabase.from('hv_operating_fund').select('*').order('created_at', { ascending: false }),
    supabase.from('invoice_payout_pool').select('*').order('created_at', { ascending: false }),
    supabase.from('claims').select('*').eq('claim_type', 'project').in('status', ['approved', 'paid']),
  ])

  // Director Saving Pool balance
  const savingBalance = (savingTxns ?? []).reduce((s, t) => {
    if (['saving_in', 'surplus_in', 'profit_in', 'fund_in', 'loan_repayment_in'].includes(t.transaction_type)) return s + Number(t.amount)
    return s - Number(t.amount)
  }, 0)

  // Invoice Pool balance
  const invoiceBalance = (invoiceTxns ?? []).reduce((s, t) => {
    if (t.transaction_type === 'accumulate') return s + Number(t.amount)
    return s - Number(t.amount)
  }, 0)

  // Total claims deducted
  const totalClaimed = (claims ?? []).reduce((s, c) => s + Number(c.amount ?? 0), 0)

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-serif text-3xl text-ink">Director Pool</h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          Director Saving (5% deduction + statutory surplus) and Invoice Pool (25% accumulation).
        </p>
      </div>

      {/* Pool Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="border border-hairline rounded-md bg-surface p-5">
          <div className="font-serif italic text-sm text-accent mb-1">Director Saving</div>
          <div className={`font-serif text-2xl ${savingBalance >= 0 ? 'text-ink' : 'text-danger'}`}>
            {formatMoney(savingBalance)}
          </div>
          <div className="font-mono text-xs text-muted mt-1">
            5% saving + statutory surplus/deficit
          </div>
        </div>
        <div className="border border-hairline rounded-md bg-surface p-5">
          <div className="font-serif italic text-sm text-accent mb-1">Director Invoice</div>
          <div className="font-serif text-2xl text-ink">{formatMoney(invoiceBalance)}</div>
          <div className="font-mono text-xs text-muted mt-1">
            25% invoice portion accumulation
          </div>
        </div>
        <div className="border border-hairline rounded-md bg-surface p-5">
          <div className="font-serif italic text-sm text-accent mb-1">Claims Deducted</div>
          <div className="font-serif text-2xl text-danger">
            {formatMoney(-totalClaimed)}
          </div>
          <div className="font-mono text-xs text-muted mt-1">
            Approved director claims from saving pool
          </div>
        </div>
      </div>

      {/* Director Saving Transactions */}
      <section className="mb-12">
        <h2 className="font-serif text-2xl text-ink mb-1">Director Saving</h2>
        <p className="font-serif italic text-graphite text-sm mb-4">
          Monthly 5% deduction from director gross + statutory surplus/deficit. Free capital for HV operations.
        </p>
        {(savingTxns ?? []).length === 0 ? (
          <div className="py-8 text-center border border-hairline rounded-md bg-surface">
            <p className="font-serif italic text-muted">No saving transactions yet.</p>
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
                {(savingTxns ?? []).map(t => {
                  const isInflow = ['saving_in', 'surplus_in', 'profit_in', 'fund_in', 'loan_repayment_in'].includes(t.transaction_type)
                  return (
                    <tr key={t.id} className="border-b border-hairline last:border-0">
                      <td className="py-3 pr-4 font-mono text-xs text-muted">
                        {dayjs(t.created_at).format('D MMM YYYY')}
                      </td>
                      <td className="py-3 pr-4">
                        <em className={`font-serif text-sm ${isInflow ? 'text-ledger' : 'text-danger'}`}>
                          {t.transaction_type.replace(/_/g, ' ')}
                        </em>
                      </td>
                      <td className="py-3 pr-4 font-serif text-sm text-ink">{t.description ?? '—'}</td>
                      <td className="py-3 pr-4 text-right font-mono tabular font-medium">
                        <span className={isInflow ? 'text-ledger' : 'text-danger'}>
                          {isInflow ? '+' : '('}{formatMoneyBare(Number(t.amount))}{isInflow ? '' : ')'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Director Invoice Pool */}
      <section className="mb-12">
        <h2 className="font-serif text-2xl text-ink mb-1">Director Invoice</h2>
        <p className="font-serif italic text-graphite text-sm mb-4">
          25% of each director&apos;s salary accumulated in isolated pool. Release requires Principal approval.
        </p>
        {(invoiceTxns ?? []).length === 0 ? (
          <div className="py-8 text-center border border-hairline rounded-md bg-surface">
            <p className="font-serif italic text-muted">No invoice accumulations yet.</p>
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
                {(invoiceTxns ?? []).map(t => {
                  const isInflow = t.transaction_type === 'accumulate'
                  return (
                    <tr key={t.id} className="border-b border-hairline last:border-0">
                      <td className="py-3 pr-4 font-mono text-xs text-muted">
                        {dayjs(t.created_at).format('D MMM YYYY')}
                      </td>
                      <td className="py-3 pr-4">
                        <em className={`font-serif text-sm ${isInflow ? 'text-ledger' : 'text-accent'}`}>
                          {t.transaction_type}
                        </em>
                      </td>
                      <td className="py-3 pr-4 font-serif text-sm text-ink">{t.description ?? '—'}</td>
                      <td className="py-3 pr-4 text-right font-mono tabular font-medium">
                        <span className={isInflow ? 'text-ledger' : 'text-accent'}>
                          {isInflow ? '+' : '-'}{formatMoneyBare(Number(t.amount))}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
