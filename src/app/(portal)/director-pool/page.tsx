import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import dayjs from 'dayjs'
import DirectorPinGate from '@/components/DirectorPinGate'
import { isDirectorPinVerified } from '../director-salary/pin-actions'

export default async function DirectorPoolPage() {
  const user = await requireRole(['principal', 'finance'])

  // Finance needs PIN verification
  if (user.role === 'finance') {
    const verified = await isDirectorPinVerified()
    if (!verified) {
      return <DirectorPinGate verified={false}><div /></DirectorPinGate>
    }
  }

  const supabase = await createClient()

  // Look up Director dept id first — Director Pool = dept_pools where dept='Director'
  const { data: directorDept } = await supabase
    .from('departments')
    .select('id')
    .eq('name', 'Director')
    .maybeSingle()

  const [
    { data: directorPoolTxns },
    { data: invoiceTxns },
    { data: claims },
  ] = await Promise.all([
    directorDept
      ? supabase
          .from('dept_pools')
          .select('*')
          .eq('department_id', directorDept.id)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
    supabase.from('invoice_payout_pool').select('*').order('created_at', { ascending: false }),
    supabase.from('claims').select('*').eq('claim_type', 'project').in('status', ['approved', 'paid']),
  ])

  // Director Pool balance — SUM(np_in) - SUM(expense_out) for Director dept
  const directorPoolBalance = (directorPoolTxns ?? []).reduce((s, t) => {
    if (t.transaction_type === 'np_in') return s + Number(t.amount)
    return s - Number(t.amount)
  }, 0)

  // Invoice Pool balance (unchanged — per-director accumulation ledger)
  const invoiceBalance = (invoiceTxns ?? []).reduce((s, t) => {
    if (t.transaction_type === 'accumulate') return s + Number(t.amount)
    return s - Number(t.amount)
  }, 0)

  // Total claims deducted (project claims against HV operating fund)
  const totalClaimed = (claims ?? []).reduce((s, c) => s + Number(c.amount ?? 0), 0)

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-serif text-3xl text-ink">Director Pool</h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          Revenue pooling from subsidiary CTC payments (includes 5% saving + 25% invoice accumulator + 75% unpaid payroll).
        </p>
      </div>

      {/* Pool Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="border border-hairline rounded-md bg-surface p-5">
          <div className="font-serif italic text-sm text-accent mb-1">Director Pool</div>
          <div className={`font-serif text-2xl ${directorPoolBalance >= 0 ? 'text-ink' : 'text-danger'}`}>
            {formatMoney(directorPoolBalance)}
          </div>
          <div className="font-mono text-xs text-muted mt-1">
            Accumulated CTC − payouts
          </div>
        </div>
        <div className="border border-hairline rounded-md bg-surface p-5">
          <div className="font-serif italic text-sm text-accent mb-1">Invoice Accumulator</div>
          <div className="font-serif text-2xl text-ink">{formatMoney(invoiceBalance)}</div>
          <div className="font-mono text-xs text-muted mt-1">
            25% per-director ledger (lives inside Director Pool)
          </div>
        </div>
        <div className="border border-hairline rounded-md bg-surface p-5">
          <div className="font-serif italic text-sm text-accent mb-1">Claims Deducted</div>
          <div className="font-serif text-2xl text-danger">
            {formatMoney(-totalClaimed)}
          </div>
          <div className="font-mono text-xs text-muted mt-1">
            Approved director project claims
          </div>
        </div>
      </div>

      {/* Director Pool Activity */}
      <section className="mb-12">
        <h2 className="font-serif text-2xl text-ink mb-1">Director Pool Activity</h2>
        <p className="font-serif italic text-graphite text-sm mb-4">
          Monthly revenue pooling from subs + payouts over time. Balance = full CTC less payroll drained.
        </p>
        {(directorPoolTxns ?? []).length === 0 ? (
          <div className="py-8 text-center border border-hairline rounded-md bg-surface">
            <p className="font-serif italic text-muted">No director pool activity yet.</p>
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
                {(directorPoolTxns ?? []).map(t => {
                  const isInflow = t.transaction_type === 'np_in'
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
