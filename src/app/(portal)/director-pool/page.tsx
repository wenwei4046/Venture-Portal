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
    { data: payouts },
    { data: directors },
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
    supabase.from('director_payouts').select('saving_amount, statutory_surplus'),
    supabase.from('directors').select('id, code, name').order('code'),
  ])

  // Director Pool balance — SUM(np_in) - SUM(expense_out) for Director dept
  const directorPoolBalance = (directorPoolTxns ?? []).reduce((s, t) => {
    if (t.transaction_type === 'np_in') return s + Number(t.amount)
    return s - Number(t.amount)
  }, 0)

  // Invoice Pool balance (per-director accumulation ledger)
  const invoiceBalance = (invoiceTxns ?? []).reduce((s, t) => {
    if (t.transaction_type === 'accumulate') return s + Number(t.amount)
    return s - Number(t.amount)
  }, 0)

  // Project claims — now deducted from Director Pool (Saving bucket)
  const totalClaimed = (claims ?? []).reduce((s, c) => s + Number(c.amount ?? 0), 0)

  // Saving bucket = 5% saving + statutory surplus − project claims
  const totalSaving = (payouts ?? []).reduce((s, p) => s + Number(p.saving_amount ?? 0), 0)
  const totalSurplus = (payouts ?? []).reduce((s, p) => s + Number(p.statutory_surplus ?? 0), 0)
  const savingBucket = totalSaving + totalSurplus - totalClaimed

  // Invoice bucket = invoice_payout_pool balance
  const invoiceBucket = invoiceBalance

  // Per-director invoice accumulation rollup
  type DirectorRow = { id: string | null; code: string | null; name: string; accumulated: number; released: number; balance: number }
  const directorRollup = new Map<string | null, DirectorRow>()
  for (const d of directors ?? []) {
    directorRollup.set(d.id, { id: d.id, code: d.code, name: d.name, accumulated: 0, released: 0, balance: 0 })
  }
  for (const t of invoiceTxns ?? []) {
    const key = t.director_id ?? null
    const row = directorRollup.get(key) ?? { id: key, code: null, name: 'Unassigned', accumulated: 0, released: 0, balance: 0 }
    const amt = Number(t.amount)
    if (t.transaction_type === 'accumulate') {
      row.accumulated += amt
      row.balance += amt
    } else {
      row.released += amt
      row.balance -= amt
    }
    directorRollup.set(key, row)
  }
  // Sort: balance desc, then code asc — keeps biggest holders on top
  const directorRows = Array.from(directorRollup.values()).sort((a, b) =>
    b.balance - a.balance || (a.code ?? 'zz').localeCompare(b.code ?? 'zz'),
  )
  const totalAccumulated = directorRows.reduce((s, r) => s + r.accumulated, 0)
  const totalReleased = directorRows.reduce((s, r) => s + r.released, 0)

  // Reconciliation: Saving + Invoice should equal Director Pool once all period payroll is PV'd out
  const bucketsTotal = savingBucket + invoiceBucket
  const pendingPayroll = directorPoolBalance - bucketsTotal

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> DIRECTOR · POOL OVERVIEW
          </div>
          <h1 className="page-title">Director Pool</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            Two earmarked buckets: <span className="text-ink">Saving</span> (5% + statutory surplus, net of project claims) and <span className="text-ink">Invoice</span> (25% per-director accumulator). Together they equal the pool once all period payroll has been PV&apos;d out.
          </p>
        </div>
      </div>

      {/* Pool Summary Cards — 2 buckets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
        <div className="border border-hairline rounded-md bg-surface p-5">
          <div className="font-serif italic text-sm text-accent mb-1">Saving</div>
          <div className={`font-serif text-2xl ${savingBucket >= 0 ? 'text-ink' : 'text-danger'}`}>
            {formatMoney(savingBucket)}
          </div>
          <div className="font-mono text-xs text-muted mt-1">
            {formatMoneyBare(totalSaving)} saving + {formatMoneyBare(totalSurplus)} surplus
            {totalClaimed > 0 ? ` − ${formatMoneyBare(totalClaimed)} claims` : ''}
          </div>
        </div>
        <div className="border border-hairline rounded-md bg-surface p-5">
          <div className="font-serif italic text-sm text-accent mb-1">Invoice</div>
          <div className="font-serif text-2xl text-ink">{formatMoney(invoiceBucket)}</div>
          <div className="font-mono text-xs text-muted mt-1">
            25% per-director accumulator (`invoice_payout_pool`)
          </div>
        </div>
      </div>

      {/* Reconciliation line */}
      <div className="mb-12 font-mono text-xs text-muted flex flex-wrap gap-x-6 gap-y-1">
        <span>
          Saving + Invoice: <span className="text-ink">{formatMoney(bucketsTotal)}</span>
        </span>
        <span>
          Director Pool balance: <span className="text-ink">{formatMoney(directorPoolBalance)}</span>
        </span>
        {Math.abs(pendingPayroll) > 0.01 ? (
          <span className="italic font-serif text-graphite">
            Pending payroll to PV: {formatMoney(pendingPayroll)}
          </span>
        ) : (
          <span className="italic font-serif text-ledger">Buckets balance ✓</span>
        )}
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

        {/* Per-director rollup */}
        {directorRows.length > 0 && (invoiceTxns ?? []).length > 0 ? (
          <div className="mb-6 overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th className="text-left">Director</th>
                  <th className="num">Accumulated</th>
                  <th className="num">Released</th>
                  <th className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                {directorRows.map(r => (
                  <tr key={r.id ?? 'unassigned'}>
                    <td>
                      <span className="font-mono text-xs text-graphite mr-2">{r.code ?? '—'}</span>
                      <span className="font-serif italic text-ink">{r.name}</span>
                    </td>
                    <td className="num">{r.accumulated > 0 ? formatMoneyBare(r.accumulated) : '—'}</td>
                    <td className="num">
                      {r.released > 0 ? <span className="neg">({formatMoneyBare(r.released)})</span> : '—'}
                    </td>
                    <td className="num font-medium">
                      {r.balance < 0 ? <span className="neg">({formatMoneyBare(Math.abs(r.balance))})</span> : formatMoneyBare(r.balance)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-hairline">
                  <td className="font-serif italic text-ink">Total</td>
                  <td className="num font-medium">{formatMoneyBare(totalAccumulated)}</td>
                  <td className="num font-medium">
                    {totalReleased > 0 ? <span className="neg">({formatMoneyBare(totalReleased)})</span> : '—'}
                  </td>
                  <td className="num font-medium">{formatMoneyBare(invoiceBucket)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}

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
