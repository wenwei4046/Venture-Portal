import Link from 'next/link'
import { Suspense } from 'react'
import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import PaymentTabs from './_components/PaymentTabs'
import PaymentFilters from './_components/PaymentFilters'
import BackToTop from './_components/BackToTop'

const POOL_LABELS: Record<string, string> = {
  hv_operating_fund: 'Venture Pool',
  dept_pool_director: 'Director Pool',
  dept_pool_marketing: 'Marketing',
  dept_pool_finance: 'Finance',
  dept_pool_hr: 'HR',
  invoice_payout_pool: 'Invoice Payout',
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'text-muted',
  pending_approval: 'text-alert',
  approved: 'text-accent',
  paid: 'text-ledger',
  voided: 'text-danger',
}

interface Props {
  searchParams: Promise<{
    status?: string
    q?: string
    type?: string
    pool?: string
    from?: string
    to?: string
    min?: string
    max?: string
  }>
}

export default async function PaymentsPage({ searchParams }: Props) {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()
  const params = await searchParams
  const statusFilter = params.status
  const qFilter = params.q?.trim().toLowerCase() ?? ''
  const typeFilter = params.type ?? ''
  const poolFilter = params.pool ?? ''
  const fromFilter = params.from ?? ''
  const toFilter = params.to ?? ''
  const minFilter = params.min ? parseFloat(params.min) : null
  const maxFilter = params.max ? parseFloat(params.max) : null

  // Fetch vouchers with category label
  const { data: vouchers } = await supabase
    .from('payment_vouchers')
    .select('*, payment_categories(label)')
    .order('created_at', { ascending: false })

  // Phase 7 Step 16: source_pool deprecated. Load pvs rows unconditionally
  // so the Pool column and filter both read the canonical subtable.
  const sourcesByVoucher = new Map<string, string[]>()
  {
    const { data: srcs } = await supabase
      .from('payment_voucher_sources')
      .select('voucher_id, pool, amount')
      .order('amount', { ascending: false })
    for (const s of srcs ?? []) {
      const list = sourcesByVoucher.get(s.voucher_id) ?? []
      list.push(s.pool)
      sourcesByVoucher.set(s.voucher_id, list)
    }
  }

  const all = vouchers ?? []
  const tab = statusFilter ?? 'all'

  // Apply all filters in-memory. Summary stats below use `all` (unfiltered
  // context), only the table uses `filtered`.
  const filtered = all.filter((v) => {
    if (tab !== 'all' && v.status !== tab) return false
    if (typeFilter && v.voucher_type !== typeFilter) return false
    if (poolFilter) {
      if (v.direction === 'credit') {
        if (v.target_pool !== poolFilter) return false
      } else {
        const poolList = sourcesByVoucher.get(v.id)
        if (!poolList || !poolList.includes(poolFilter)) return false
      }
    }
    if (fromFilter && dayjs(v.created_at).isBefore(dayjs(fromFilter), 'day')) return false
    if (toFilter && dayjs(v.created_at).isAfter(dayjs(toFilter), 'day')) return false
    if (minFilter !== null && Number(v.amount) < minFilter) return false
    if (maxFilter !== null && Number(v.amount) > maxFilter) return false
    if (qFilter) {
      const hay = `${v.voucher_no ?? ''} ${v.description ?? ''} ${v.payee_name ?? ''}`.toLowerCase()
      if (!hay.includes(qFilter)) return false
    }
    return true
  })

  const counts = {
    all: all.length,
    draft: all.filter((v) => v.status === 'draft').length,
    pending_approval: all.filter((v) => v.status === 'pending_approval').length,
    approved: all.filter((v) => v.status === 'approved').length,
    paid: all.filter((v) => v.status === 'paid').length,
    voided: all.filter((v) => v.status === 'voided').length,
  }

  const totalPaid = all
    .filter((v) => v.status === 'paid')
    .reduce((sum, v) => sum + Number(v.amount), 0)

  const pendingAmount = all
    .filter((v) => ['draft', 'pending_approval', 'approved'].includes(v.status))
    .reduce((sum, v) => sum + Number(v.amount), 0)

  return (
    <div>
      {/* ───────── Header ───────── */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4 mb-10">
        <div>
          <h1 className="font-serif text-3xl text-ink">Payments</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            All money in and out goes through a payment voucher. Finance creates, Principal approves, Finance executes.
          </p>
        </div>
        <Link
          href="/payments/new"
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
        >
          Create payment
        </Link>
      </div>

      {/* ───────── Summary ───────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12 pb-12 border-b border-hairline">
        <div>
          <div className="font-serif italic text-accent text-sm mb-1">Total paid</div>
          <div className="font-serif text-3xl text-ink">{formatMoney(totalPaid)}</div>
          <div className="font-mono text-xs text-muted mt-1">{counts.paid} voucher{counts.paid === 1 ? '' : 's'} executed</div>
        </div>
        <div>
          <div className="font-serif italic text-alert text-sm mb-1">Pending pipeline</div>
          <div className="font-serif text-3xl text-ink">{formatMoney(pendingAmount)}</div>
          <div className="font-mono text-xs text-muted mt-1">
            {counts.draft} draft · {counts.pending_approval} pending · {counts.approved} approved
          </div>
        </div>
        <div>
          <div className="font-serif italic text-graphite text-sm mb-1">All vouchers</div>
          <div className="font-serif text-3xl text-ink">{counts.all}</div>
          <div className="font-mono text-xs text-muted mt-1">
            {counts.voided} voided
          </div>
        </div>
      </div>

      {/* ───────── Tabs + list ───────── */}
      {all.length === 0 ? (
        <div className="py-16 text-center border border-hairline rounded-md bg-surface">
          <p className="font-serif italic text-graphite text-lg mb-4">
            No payment vouchers yet.
          </p>
          <Link
            href="/payments/new"
            className="inline-block bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            Create first payment
          </Link>
        </div>
      ) : (
        <section>
          <Suspense fallback={null}>
            <PaymentTabs />
          </Suspense>

          <Suspense fallback={null}>
            <PaymentFilters />
          </Suspense>

          <p className="font-serif italic text-graphite text-sm mb-4">
            {filtered.length} of {all.length} voucher{all.length === 1 ? '' : 's'}
            {tab !== 'all' ? ` · ${tab.replace('_', ' ')}` : ''}
          </p>

          {filtered.length === 0 ? (
            <div className="border border-hairline rounded-md bg-surface p-8 text-center">
              <p className="font-serif italic text-muted text-sm">
                No {tab.replace('_', ' ')} vouchers.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                    <th className="text-left py-3 pr-4 font-medium">Voucher #</th>
                    <th className="text-left py-3 pr-4 font-medium">Category</th>
                    <th className="text-left py-3 pr-4 font-medium">Pool</th>
                    <th className="text-left py-3 pr-4 font-medium">Payee</th>
                    <th className="text-right py-3 pr-4 font-medium">Amount</th>
                    <th className="text-left py-3 pr-4 font-medium">Status</th>
                    <th className="text-right py-3 pr-4 font-medium">Date</th>
                    <th className="py-3"></th>
                  </tr>
                </thead>
                <tbody className="row-stagger">
                  {filtered.map((v, i) => {
                    const catLabel = (v.payment_categories as { label: string } | null)?.label
                      ?? (v.category_code ? v.category_code.replace(/_/g, ' ') : '—')
                    // Phase 7 Step 16: debit reads pvs subtable; credit keeps target_pool.
                    let poolLabel = '—'
                    if (v.direction === 'credit') {
                      poolLabel = v.target_pool
                        ? (POOL_LABELS[v.target_pool] ?? v.target_pool.replace(/_/g, ' '))
                        : '—'
                    } else {
                      const pools = sourcesByVoucher.get(v.id) ?? []
                      if (pools.length > 0) {
                        poolLabel = pools.map(p => POOL_LABELS[p] ?? p.replace(/_/g, ' ')).join(' + ')
                      } else if (v.source_pool) {
                        poolLabel = POOL_LABELS[v.source_pool] ?? v.source_pool.replace(/_/g, ' ')
                      }
                    }
                    return (
                      <tr
                        key={v.id}
                        style={{ '--i': i } as React.CSSProperties}
                        className="border-b border-hairline last:border-0 hover:bg-surface-2/40 transition-colors"
                      >
                        <td className="py-4 pr-4 font-mono text-xs text-ink">
                          {v.voucher_no ?? '—'}
                        </td>
                        <td className="py-4 pr-4 font-serif italic text-graphite capitalize">
                          {catLabel}
                        </td>
                        <td className="py-4 pr-4 font-mono text-xs text-muted">
                          {poolLabel}
                        </td>
                        <td className="py-4 pr-4 font-serif text-ink truncate max-w-[200px]">
                          {v.payee_name}
                        </td>
                        <td className="py-4 pr-4 text-right font-mono tabular font-medium">
                          <span className={v.direction === 'credit' ? 'text-ledger' : 'text-ink'}>
                            {v.direction === 'credit' ? '+' : '−'}{formatMoney(Number(v.amount)).replace('RM ', '')}
                          </span>
                        </td>
                        <td className="py-4 pr-4">
                          <em className={`font-serif text-sm ${STATUS_STYLES[v.status] ?? 'text-muted'}`}>
                            {v.status.replace('_', ' ')}
                          </em>
                        </td>
                        <td className="py-4 pr-4 text-right font-mono text-xs text-muted">
                          {dayjs(v.payment_date ?? v.created_at).format('D MMM')}
                        </td>
                        <td className="py-4 text-right">
                          <Link
                            href={`/payments/${v.id}`}
                            className="text-sm text-accent hover:text-accent-hover font-serif italic"
                          >
                            View
                          </Link>
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

      <BackToTop />
    </div>
  )
}
