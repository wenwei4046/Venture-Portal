import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import { fetchAllRows } from '@/lib/paginate'
import dayjs from 'dayjs'
import DirectorPinGate from '@/components/DirectorPinGate'
import { isDirectorPinVerified } from '../director-salary/pin-actions'

export default async function DirectorPoolPage() {
  const user = await requireRole(['principal', 'finance'])
  const isPrincipal = user.role === 'principal'

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
    { data: advancePayouts },
    { data: directors },
    { data: deptBalances },
  ] = await Promise.all([
    directorDept
      ? fetchAllRows((lo, hi) => supabase
          .from('dept_pools')
          .select('*')
          .eq('department_id', directorDept.id)
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(lo, hi)).then((data) => ({ data }))
      : Promise.resolve({ data: [] as never[] }),
    fetchAllRows((lo, hi) => supabase.from('invoice_payout_pool').select('*').order('created_at', { ascending: false }).order('id', { ascending: true }).range(lo, hi)).then((data) => ({ data })),
    // Saving bucket only deducts pool claims whose source_pool is dept_pool_director.
    // Other source_pool values (venture_pool / dept_pool_marketing / etc) come out
    // of their own pool's ledger — not Saving — so they must not subtract here.
    fetchAllRows((lo, hi) => supabase.from('claims').select('*').eq('claim_type', 'project').eq('source_pool', 'dept_pool_director').in('status', ['approved', 'paid']).order('id', { ascending: true }).range(lo, hi)).then((data) => ({ data })),
    fetchAllRows((lo, hi) => supabase.from('director_payouts').select('saving_amount, statutory_surplus').order('id', { ascending: true }).range(lo, hi)).then((data) => ({ data })),
    // For Total Advance: latest confirmed/paid closing balance per director
    // (pagination preserves the period_month-desc global order, so "first row
    // per director" below still resolves to that director's latest period).
    fetchAllRows((lo, hi) => supabase
      .from('director_payouts')
      .select('director_id, period_month, advance_balance')
      .in('status', ['confirmed', 'paid'])
      .order('period_month', { ascending: false })
      .order('id', { ascending: true })
      .range(lo, hi)).then((data) => ({ data })),
    supabase.from('directors').select('id, code, name').order('code'),
    // For per-director Billed/Used/Remaining: other depts' negative balances
    // = amount "borrowed" from Director's invoice pool, pro-rated by ratio.
    supabase.from('dept_pool_balances').select('department_id, balance'),
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

  // Pool claims with source=Director Pool — deducted from the Saving sub-bucket
  const totalClaimed = (claims ?? []).reduce((s, c) => s + Number(c.amount ?? 0), 0)

  // Saving bucket = 5% saving + statutory surplus − pool claims (source=Director Pool)
  const totalSaving = (payouts ?? []).reduce((s, p) => s + Number(p.saving_amount ?? 0), 0)
  const totalSurplus = (payouts ?? []).reduce((s, p) => s + Number(p.statutory_surplus ?? 0), 0)
  const savingBucket = totalSaving + totalSurplus - totalClaimed

  // Invoice bucket = invoice_payout_pool balance
  const invoiceBucket = invoiceBalance

  // Total Advance = sum of each director's latest confirmed/paid advance_balance.
  // advancePayouts is ordered by period_month DESC, so first row per director_id wins.
  const latestAdvancePerDirector = new Map<string, number>()
  for (const p of advancePayouts ?? []) {
    if (!latestAdvancePerDirector.has(p.director_id)) {
      latestAdvancePerDirector.set(p.director_id, Number(p.advance_balance ?? 0))
    }
  }
  const totalAdvance = Array.from(latestAdvancePerDirector.values()).reduce((s, v) => s + v, 0)

  // Total Pool = net amount HV holds on directors' behalf
  const totalPool = savingBucket + invoiceBucket - totalAdvance

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

  // Per-director Billed / Used / Remaining.
  // "Used" model: when any non-Director pool goes negative, that deficit is
  // effectively financed by Director's invoice accumulator. Includes:
  //   - other dept pools (Marketing / HR / Finance / Director Office) from
  //     dept_pool_balances
  //   - Office (corporate segment) cash from journal_lines (segment='corporate'
  //     on HV bank accounts), since corporate has no dept_pools row
  // Pro-rate across directors by their share of the total billed pool. The
  // resulting "Remaining" then equals total billed minus all deficits =
  // physical bank balance (the real money still available for payout).
  const otherDeptsNetNegative = (deptBalances ?? [])
    .filter((b) => b.department_id !== directorDept?.id)
    .map((b) => Number(b.balance))
    .filter((v) => v < 0)
    .reduce((s, v) => s + v, 0) // negative number

  // Office (corporate) cash from GL — include if negative.
  const officeBankRows = await fetchAllRows((lo, hi) => supabase
    .from('journal_lines')
    .select('debit, credit, journal_entries!inner(segment)')
    .in('account_code', ['3000', '3010'])
    .eq('journal_entries.segment', 'corporate')
    .order('id', { ascending: true })
    .range(lo, hi))
  let officeCash = 0
  for (const r of officeBankRows ?? []) {
    officeCash += Number(r.debit ?? 0) - Number(r.credit ?? 0)
  }
  const officeNegative = officeCash < 0 ? officeCash : 0
  const totalUsed = Math.abs(otherDeptsNetNegative + officeNegative) // positive
  const r2 = (n: number) => Math.round(n * 100) / 100
  type UsageRow = { id: string | null; code: string | null; name: string; billed: number; used: number; remaining: number }
  let runningUsedSum = 0
  const usageRows: UsageRow[] = directorRows.map((r, idx) => {
    let used: number
    if (totalAccumulated <= 0) {
      used = 0
    } else if (idx === directorRows.length - 1) {
      // Last row absorbs rounding so column sum = totalUsed exactly.
      used = r2(totalUsed - runningUsedSum)
    } else {
      used = r2((r.accumulated / totalAccumulated) * totalUsed)
      runningUsedSum += used
    }
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      billed: r.accumulated,
      used,
      remaining: r2(r.accumulated - used),
    }
  })
  const usageTotals = {
    billed: r2(usageRows.reduce((s, r) => s + r.billed, 0)),
    used: r2(usageRows.reduce((s, r) => s + r.used, 0)),
    remaining: r2(usageRows.reduce((s, r) => s + r.remaining, 0)),
  }

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
        </div>
      </div>

      {/* Hero — Total Pool (Saving + Invoice − Advance) */}
      <div className="mb-8 pb-6 border-b border-hairline">
        <div className="font-serif italic text-sm text-accent mb-1">Total Pool</div>
        <div className={`font-serif text-[44px] md:text-hero leading-none tabular tracking-[-0.01em] ${totalPool >= 0 ? 'text-num-ink' : 'text-danger'}`}>
          {formatMoney(totalPool)}
        </div>
        <div className="font-mono text-[11.5px] text-graphite mt-3 tracking-[0.02em]">
          {formatMoneyBare(savingBucket)} saving + {formatMoneyBare(invoiceBucket)} invoice
          {totalAdvance > 0 ? ` − ${formatMoneyBare(totalAdvance)} advance` : ''}
        </div>
      </div>

      {/* Pool Sub-buckets — Saving / Invoice / Total Advance */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
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
          {isPrincipal && (
            <div className="font-mono text-xs text-muted mt-1">
              25% per-director accumulator (`invoice_payout_pool`)
            </div>
          )}
        </div>
        <div className="border border-hairline rounded-md bg-surface p-5">
          <div className="font-serif italic text-sm text-accent mb-1">Total Advance</div>
          <div className={`font-serif text-2xl ${totalAdvance > 0 ? 'text-alert' : 'text-ink'}`}>
            {formatMoney(totalAdvance)}
          </div>
          <div className="font-mono text-xs text-muted mt-1">
            Outstanding advance owed by directors
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

      {/* Director Invoice Pool — per-director detail; Principal only */}
      {isPrincipal && (
      <section className="mb-12">
        <h2 className="font-serif text-2xl text-ink mb-1">Director Invoice</h2>

        {/* Per-director rollup */}
        {directorRows.length > 0 && (invoiceTxns ?? []).length > 0 ? (
          <div className="mb-6 overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Director</th>
                  <th className="right">Accumulated</th>
                  <th className="right">Released</th>
                  <th className="right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {directorRows.map(r => (
                  <tr key={r.id ?? 'unassigned'}>
                    <td>
                      <span className="font-mono text-sm text-ink">{r.code ?? r.name}</span>
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
      )}

      {/* Per-director Billed / Used / Remaining — Principal only.
          Models the user's accounting view: other depts going negative
          have "borrowed" from Director's invoice accumulator, allocated
          pro-rata across directors by their share of total billed. */}
      {isPrincipal && usageRows.length > 0 && totalAccumulated > 0 ? (
        <section className="mb-12">
          <h2 className="font-serif text-2xl text-ink mb-1">Per-director usage</h2>
          <p className="font-serif italic text-muted text-xs mb-4 max-w-2xl">
            Other departments&apos; negative dept-pool balances are funded by
            Director&apos;s invoice accumulator. The {formatMoney(totalUsed)} total
            shortfall is pro-rated across each director by their share of the
            billed pool ({formatMoney(totalAccumulated)}).
          </p>
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Director</th>
                  <th className="right">Total billed</th>
                  <th className="right">Used</th>
                  <th className="right">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {usageRows.map((r) => (
                  <tr key={r.id ?? 'unassigned'}>
                    <td>
                      <span className="font-mono text-sm text-ink">{r.code ?? r.name}</span>
                    </td>
                    <td className="num">{r.billed > 0 ? formatMoneyBare(r.billed) : '—'}</td>
                    <td className="num">
                      {r.used > 0 ? <span className="neg">({formatMoneyBare(r.used)})</span> : '—'}
                    </td>
                    <td className={`num font-medium ${r.remaining < 0 ? 'neg' : ''}`}>
                      {r.remaining < 0
                        ? <span className="neg">({formatMoneyBare(Math.abs(r.remaining))})</span>
                        : formatMoneyBare(r.remaining)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-hairline">
                  <td className="font-serif italic text-ink">Total</td>
                  <td className="num font-medium">{formatMoneyBare(usageTotals.billed)}</td>
                  <td className="num font-medium">
                    {usageTotals.used > 0
                      ? <span className="neg">({formatMoneyBare(usageTotals.used)})</span>
                      : '—'}
                  </td>
                  <td className="num font-medium text-num-ink">
                    {formatMoneyBare(usageTotals.remaining)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
