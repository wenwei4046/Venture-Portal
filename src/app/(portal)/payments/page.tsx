import Link from 'next/link'
import { Suspense } from 'react'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import PaymentTabs from './_components/PaymentTabs'
import PaymentFilters from './_components/PaymentFilters'
import BackToTop from './_components/BackToTop'
import VouchersTable, { type VoucherRow } from './_components/VouchersTable'
import dayjs from 'dayjs'

const POOL_LABELS: Record<string, string> = {
  venture_pool: 'Venture Pool',
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
  const user = await requireRole(['principal', 'finance'])
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

  // Fetch vouchers (category labels now live on sources — loaded below)
  const { data: vouchers } = await supabase
    .from('payment_vouchers')
    .select('*')
    .order('created_at', { ascending: false })

  // Stage D/E surface: count payroll_payment_requests needing Finance action.
  // Shown as a badge in the header so Finance doesn't miss HR's handoff.
  const { count: payrollRequestsPending } = await supabase
    .from('payroll_payment_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'submitted')

  // Post-mig 238: PVS rows reference chart_of_accounts via account_code
  // (the COA `code` IS the GL). Load once, index by voucher_id, then derive
  // pool list + account name list for the table cells.
  const sourcesByVoucher = new Map<string, string[]>()
  const categoriesByVoucher = new Map<string, string[]>()
  {
    const { data: srcs } = await supabase
      .from('payment_voucher_sources')
      .select('voucher_id, pool, amount, account_code, chart_of_accounts!pvs_account_code_fk(name)')
      .order('amount', { ascending: false })
    for (const s of (srcs ?? []) as Array<{
      voucher_id: string
      pool: string
      account_code: string | null
      chart_of_accounts: { name: string } | null
    }>) {
      const pools = sourcesByVoucher.get(s.voucher_id) ?? []
      pools.push(s.pool)
      sourcesByVoucher.set(s.voucher_id, pools)

      const label =
        s.chart_of_accounts?.name ??
        (s.account_code ? s.account_code.replace(/_/g, ' ') : null)
      if (label) {
        const cats = categoriesByVoucher.get(s.voucher_id) ?? []
        if (!cats.includes(label)) cats.push(label)
        categoriesByVoucher.set(s.voucher_id, cats)
      }
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
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · PAYMENTS & RECEIPTS
          </div>
          <h1 className="page-title">Payments</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Export buttons */}
          {(() => {
            const exportQs = new URLSearchParams(
              Object.entries(params)
                .filter(([, v]) => v !== undefined && v !== null && v !== '')
                .map(([k, v]) => [k, String(v)])
            ).toString()
            return (
              <>
                <Link
                  href={`/payments/export?format=xlsx${exportQs ? '&' + exportQs : ''}`}
                  className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
                >
                  Export Excel
                </Link>
                <Link
                  href={`/payments/export?format=pdf${exportQs ? '&' + exportQs : ''}`}
                  className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
                >
                  Export PDF
                </Link>
              </>
            )
          })()}
          <Link
            href="/payments/payroll-requests"
            className={
              (payrollRequestsPending ?? 0) > 0
                ? 'bg-surface hover:bg-surface-2 border border-accent-border text-accent font-serif italic text-sm px-3 py-2 rounded-md transition-colors flex items-center gap-2'
                : 'bg-surface hover:bg-surface-2 border border-hairline text-graphite font-serif italic text-sm px-3 py-2 rounded-md transition-colors flex items-center gap-2'
            }
          >
            Payroll Requests
            {(payrollRequestsPending ?? 0) > 0 ? (
              <span className="bg-accent text-white font-mono text-[10px] px-1.5 py-0.5 rounded">
                {payrollRequestsPending}
              </span>
            ) : null}
          </Link>
          {user.role === 'finance' ? (
            <>
              <Link
                href="/payments/new?mode=loan_repayment"
                className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
              >
                收到 loan 还款
              </Link>
              <Link
                href="/payments/new"
                className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
              >
                Create payment
              </Link>
            </>
          ) : null}
        </div>
      </div>

      {/* ───────── Summary ───────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12 pb-12 border-b border-hairline">
        <div>
          <div className="font-serif italic text-accent text-sm mb-1">Total paid</div>
          <div className="font-serif text-3xl text-num-ink tabular">{formatMoney(totalPaid)}</div>
          <div className="font-mono text-[11.5px] text-graphite mt-1.5 tracking-[0.02em] font-medium">
            {counts.paid} VOUCHER{counts.paid === 1 ? '' : 'S'} EXECUTED
          </div>
        </div>
        <div>
          <div className="font-serif italic text-alert text-sm mb-1">Pending pipeline</div>
          <div className="font-serif text-3xl text-num-ink tabular">{formatMoney(pendingAmount)}</div>
          <div className="font-mono text-[11.5px] text-graphite mt-1.5 tracking-[0.02em] font-medium">
            {counts.draft} DRAFT · {counts.pending_approval} PENDING · {counts.approved} APPROVED
          </div>
        </div>
        <div>
          <div className="font-serif italic text-graphite text-sm mb-1">All vouchers</div>
          <div className="font-serif text-3xl text-num-ink tabular">{counts.all}</div>
          <div className="font-mono text-[11.5px] text-graphite mt-1.5 tracking-[0.02em] font-medium">
            {counts.voided} VOIDED
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
              <VouchersTable
                rows={filtered.map<VoucherRow>((v) => {
                  const cats = categoriesByVoucher.get(v.id) ?? []
                  const catLabel = cats.length > 0 ? cats.join(' + ') : '—'
                  let poolLabel = '—'
                  if (v.direction === 'credit') {
                    poolLabel = v.target_pool
                      ? (POOL_LABELS[v.target_pool] ?? v.target_pool.replace(/_/g, ' '))
                      : '—'
                  } else {
                    const pools = sourcesByVoucher.get(v.id) ?? []
                    if (pools.length > 0) {
                      poolLabel = pools.map((p) => POOL_LABELS[p] ?? p.replace(/_/g, ' ')).join(' + ')
                    } else if (v.source_pool) {
                      poolLabel = POOL_LABELS[v.source_pool] ?? v.source_pool.replace(/_/g, ' ')
                    }
                  }
                  return {
                    id: v.id,
                    voucher_no: v.voucher_no,
                    direction: v.direction as 'credit' | 'debit',
                    amount: Number(v.amount),
                    payee_name: v.payee_name,
                    status: v.status,
                    catLabel,
                    poolLabel,
                    description: (v.description as string | null) ?? null,
                    paymentOrCreatedDate: (v.payment_date ?? v.created_at) as string,
                  }
                })}
              />
            </div>
          )}
        </section>
      )}

      <BackToTop />
    </div>
  )
}
