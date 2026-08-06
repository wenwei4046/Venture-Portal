import Link from 'next/link'
import { Suspense } from 'react'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/paginate'
import { fetchReceiptExtras, filterReceiptExtras } from '@/lib/receipt-extras'
import { fetchPaymentExtras } from '@/lib/payment-extras'
import { formatMoney } from '@/lib/utils'
import PaymentTabs from './PaymentTabs'
import PaymentFilters from './PaymentFilters'
import BackToTop from './BackToTop'
import VouchersTable, { type VoucherRow } from './VouchersTable'
import dayjs from 'dayjs'

// Shared ledger page for /payments (debit, HV-PV-*) and /receipts (credit,
// HV-OR-*) — split per user 2026-06-12: the payment side shows only PVs, the
// receipt side only ORs. Same tabs/filters/table on both.

const POOL_LABELS: Record<string, string> = {
  venture_pool: 'Venture Pool',
  dept_pool_director: 'Director Pool',
  dept_pool_marketing: 'Marketing',
  dept_pool_finance: 'Finance',
  dept_pool_hr: 'HR',
  invoice_payout_pool: 'Invoice Payout',
}


export interface LedgerSearchParams {
  status?: string
  q?: string
  type?: string
  pool?: string
  from?: string
  to?: string
  min?: string
  max?: string
}

export default async function VoucherLedger({
  direction,
  params,
}: {
  direction: 'debit' | 'credit'
  params: LedgerSearchParams
}) {
  const user = await requireRole(['principal', 'finance'])
  const supabase = await createClient()
  const isReceipts = direction === 'credit'
  const statusFilter = params.status
  const qFilter = params.q?.trim().toLowerCase() ?? ''
  const typeFilter = params.type ?? ''
  const poolFilter = params.pool ?? ''
  const fromFilter = params.from ?? ''
  const toFilter = params.to ?? ''
  const minFilter = params.min ? parseFloat(params.min) : null
  const maxFilter = params.max ? parseFloat(params.max) : null

  // Fetch this side's vouchers only (category labels live on sources — below)
  const vouchers = await fetchAllRows((lo, hi) => supabase
    .from('payment_vouchers')
    .select('*')
    .eq('direction', direction)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(lo, hi))

  // Stage D/E surface: payroll requests badge — payment side only.
  const { count: payrollRequestsPending } = isReceipts
    ? { count: 0 }
    : await supabase
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

  // ── Money that moved OUTSIDE the voucher flow, both sides ──
  // Receipts: direct loan repayments + Fund IN capital (user 2026-07-24: "把
  // 收到repayment的钱和fund in 的钱全部都显示在receipt这边"). Payments: direct
  // fund-source repayments (no PV) + Loan OUT disbursements (user 2026-08-06:
  // "不能像reciept 这样显示全部吗？"). Shared with /payments/export.
  const extraRows: VoucherRow[] = isReceipts
    ? await fetchReceiptExtras(supabase)
    : await fetchPaymentExtras(supabase)

  const all = vouchers ?? []
  const tab = statusFilter ?? 'all'

  const extraFiltered = filterReceiptExtras(extraRows, {
    tab, typeFilter, poolFilter, fromFilter, toFilter, minFilter, maxFilter, qFilter,
  })

  // Apply all filters in-memory. Summary stats below use `all` (unfiltered
  // context), only the table uses `filtered`.
  // A repayment PV is typed 'expense' in the DB — what marks it as a loan
  // repayment is the fund_source_id / legacy loan_id link. The "Loan
  // repayment" type filter matched voucher_type only, which NO voucher has,
  // so it always came back empty (user 2026-08-06: "无法找到那个payment
  // voucher"). Match the link instead.
  const isLoanRepay = (v: { fund_source_id?: string | null; loan_id?: string | null; voucher_type?: string | null }) =>
    v.fund_source_id != null || v.loan_id != null || v.voucher_type === 'loan_repayment'

  const filtered = all.filter((v) => {
    if (tab !== 'all' && v.status !== tab) return false
    if (typeFilter === 'loan_repayment') {
      if (!isLoanRepay(v)) return false
    } else if (typeFilter && v.voucher_type !== typeFilter) return false
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
      const hay = `${v.voucher_no ?? ''} ${v.description ?? ''} ${v.payee_name ?? ''}${isLoanRepay(v) ? ' loan repayment 还款' : ''}`.toLowerCase()
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

  // Settled money = executed vouchers + the outside-the-flow rows.
  const extraTotal = extraRows.reduce((sum, r) => sum + r.amount, 0)
  const nRepayments = extraRows.filter((r) => r.id.startsWith('rpy-')).length
  const nFundIn = extraRows.filter((r) => r.id.startsWith('fin-')).length
  const nFsRepay = extraRows.filter((r) => r.id.startsWith('fsr-')).length
  const nLoanOut = extraRows.filter((r) => r.id.startsWith('lout-')).length
  const totalPaid = all
    .filter((v) => v.status === 'paid')
    .reduce((sum, v) => sum + Number(v.amount), 0) + extraTotal

  const pendingAmount = all
    .filter((v) => ['draft', 'pending_approval', 'approved'].includes(v.status))
    .reduce((sum, v) => sum + Number(v.amount), 0)

  const noun = isReceipts ? 'receipt' : 'voucher'

  return (
    <div>
      {/* ───────── Header ───────── */}
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · {isReceipts ? 'OFFICIAL RECEIPTS' : 'PAYMENT VOUCHERS'}
          </div>
          <h1 className="page-title">{isReceipts ? 'Receipts' : 'Payments'}</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Export buttons */}
          {(() => {
            const exportQs = new URLSearchParams([
              ...Object.entries(params)
                .filter(([, v]) => v !== undefined && v !== null && v !== '')
                .map(([k, v]) => [k, String(v)] as [string, string]),
              ['direction', direction],
            ]).toString()
            return (
              <>
                <Link
                  href={`/payments/export?format=xlsx&${exportQs}`}
                  className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
                >
                  Export Excel
                </Link>
                <Link
                  href={`/payments/export?format=pdf&${exportQs}`}
                  className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
                >
                  Export PDF
                </Link>
              </>
            )
          })()}
          {!isReceipts ? (
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
          ) : null}
          {user.role === 'finance' || user.role === 'principal' ? (
            isReceipts ? (
              <>
                <Link
                  href="/payments/new?mode=loan_repayment"
                  className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
                >
                  收到 loan 还款
                </Link>
                <Link
                  href="/payments/new?mode=receipt"
                  className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
                >
                  Create receipt
                </Link>
              </>
            ) : (
              <Link
                href="/payments/new"
                className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
              >
                Create payment
              </Link>
            )
          ) : null}
        </div>
      </div>

      {/* ───────── Summary ───────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12 pb-12 border-b border-hairline">
        <div>
          <div className="font-serif italic text-accent text-sm mb-1">
            {isReceipts ? 'Total received' : 'Total paid'}
          </div>
          <div className="font-serif text-3xl text-num-ink tabular">{formatMoney(totalPaid)}</div>
          <div className="font-mono text-[11.5px] text-graphite mt-1.5 tracking-[0.02em] font-medium">
            {extraRows.length > 0
              ? isReceipts
                ? `${counts.paid} RECEIPTS · ${nRepayments} LOAN RPY · ${nFundIn} FUND IN`
                : `${counts.paid} PVS · ${nFsRepay} 还款 · ${nLoanOut} LOAN OUT`
              : `${counts.paid} ${noun.toUpperCase()}${counts.paid === 1 ? '' : 'S'} EXECUTED`}
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
          <div className="font-serif italic text-graphite text-sm mb-1">
            All {noun}s
          </div>
          <div className="font-serif text-3xl text-num-ink tabular">{counts.all}</div>
          <div className="font-mono text-[11.5px] text-graphite mt-1.5 tracking-[0.02em] font-medium">
            {counts.voided} VOIDED
          </div>
        </div>
      </div>

      {/* ───────── Tabs + list ───────── */}
      {all.length === 0 && extraRows.length === 0 ? (
        <div className="py-16 text-center border border-hairline rounded-md bg-surface">
          <p className="font-serif italic text-graphite text-lg mb-4">
            No {isReceipts ? 'official receipts' : 'payment vouchers'} yet.
          </p>
          <Link
            href={isReceipts ? '/payments/new?mode=receipt' : '/payments/new'}
            className="inline-block bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            {isReceipts ? 'Create first receipt' : 'Create first payment'}
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
            {filtered.length + extraFiltered.length} of {all.length + extraRows.length} {noun}
            {all.length + extraRows.length === 1 ? '' : 's'}
            {tab !== 'all' ? ` · ${tab.replace('_', ' ')}` : ''}
          </p>

          {filtered.length + extraFiltered.length === 0 ? (
            <div className="border border-hairline rounded-md bg-surface p-8 text-center">
              <p className="font-serif italic text-muted text-sm">
                No {tab.replace('_', ' ')} {noun}s.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <VouchersTable
                rows={[...filtered.map<VoucherRow>((v) => {
                  const cats = categoriesByVoucher.get(v.id) ?? []
                  // 还款 · prefix keeps repayment PVs recognizable (and
                  // searchable/filterable by the Category column) even though
                  // their voucher_type is plain 'expense'.
                  const baseCat = cats.length > 0 ? cats.join(' + ') : '—'
                  const catLabel = isLoanRepay(v) ? `还款 · ${baseCat === '—' ? 'Loan' : baseCat}` : baseCat
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
                }), ...extraFiltered]}
              />
            </div>
          )}
        </section>
      )}

      <BackToTop />
    </div>
  )
}
