import Link from 'next/link'
import { Suspense } from 'react'
import { requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { canSeePayrollPayouts } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows, fetchAllRowsAsWritten } from '@/lib/paginate'
import { fetchReceiptExtras, filterReceiptExtras } from '@/lib/receipt-extras'
import { fetchPaymentExtras } from '@/lib/payment-extras'
import { startRead } from '@/lib/start-read'
import { formatMoney } from '@/lib/utils'
import { filterLockedBatches, isPayrollReference, lockPayrollBatches } from '@/lib/payroll-vouchers'
import PaymentTabs from './PaymentTabs'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import BackToTop from './BackToTop'
import VouchersTable, { type VoucherRow } from './VouchersTable'
import dayjs from 'dayjs'
import { officeTime } from '@/lib/office-time'

// 2026-10-10 — the handoff's head buttons: `pay-act` is a secondary one (white,
// hidden on a phone on the Finance view), `pay-act-pri` the page's one action.
const ACT = 'pay-act bg-surface hover:bg-surface-2 border border-hairline text-graphite font-serif italic text-sm px-3 py-2 rounded-md transition-colors flex items-center gap-2'
const ACT_LIT = 'pay-act bg-surface hover:bg-surface-2 border border-accent-border text-accent font-serif italic text-sm px-3 py-2 rounded-md transition-colors flex items-center gap-2'
const ACT_PRI = 'pay-act pay-act-pri bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors'

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
  const user = await requirePermission('treasury')
  // Without Payroll payouts (2026-10-02) payroll is one locked total per
  // batch: its vouchers are folded here, on the server, and never sent on.
  const seesPayroll = canSeePayrollPayouts(user)
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

  // ── Every read the ledger needs, started together (2026-10-08) ─────────
  // None needs another's answer, yet they were five round trips one after
  // another (~400–450 ms in production). Each is still awaited, below, where
  // its answer is used.

  // Fetch this side's vouchers only (category labels live on sources — below).
  // The columns this page reads, not `*` (2026-10-08): with every column —
  // notes, repayment breakdowns, approval and journal links nobody here shows
  // — a side's vouchers came to ~340 KB.
  const vouchersRead = startRead(
    fetchAllRows((lo, hi) => supabase
      .from('payment_vouchers')
      .select('id, voucher_no, direction, amount, payee_name, status, voucher_type, reference_type, description, payment_date, created_at, target_pool, source_pool, fund_source_id, loan_id, bank_account_id')
      .eq('direction', direction)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(lo, hi)),
  )

  // Stage D/E surface: payroll requests badge — payment side only.
  const payrollRequestsRead = isReceipts || !seesPayroll
    ? null
    : startRead(
        supabase
          .from('payroll_payment_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'submitted'),
      )

  // Approved claims waiting for Finance's voucher (2026-10-08) — payment side
  // only. A badge, never a reason for the ledger itself not to open.
  const claimRequestsRead = isReceipts
    ? null
    : startRead((async () => {
        try {
          const { data } = await supabase.rpc('claim_payment_queue')
          return (data ?? []).filter(r => !r.voucher_id).length
        } catch {
          return 0
        }
      })())

  // Every source row (2026-10-08): 620 rows today, past PostgREST's 1000-row
  // cap the vouchers beyond it would lose their pool and category. Read as
  // written first: a voucher's labels join in arrival order, and two sources
  // of one amount arrive as the database hands them over — only a capped
  // answer is read again, paged, with `id` breaking those ties.
  const sourcesRead = startRead(
    fetchAllRowsAsWritten((page) => {
      const q = supabase
        .from('payment_voucher_sources')
        .select('voucher_id, pool, amount, account_code, chart_of_accounts!pvs_account_code_fk(name)')
        .order('amount', { ascending: false })
      return page ? q.order('id', { ascending: true }).range(page.from, page.to) : q
    }).then(
      (data) => ({ data }),
      // A failed read leaves the labels blank, as it always did.
      () => ({ data: null }),
    ),
  )

  // The receipt side names each receipt's bank (2026-10-09, the Finance revamp).
  const banksRead = isReceipts ? startRead(supabase.from('bank_accounts').select('id, bank_name')) : null

  // A locked payroll batch stands department by department (2026-10-13): the
  // names a voucher's text may give its department by (lib/payroll-vouchers).
  const departmentsRead = seesPayroll || isReceipts ? null : startRead(supabase.from('departments').select('name'))

  // Money that moved outside the voucher flow (extraRows below).
  const extraRowsRead = startRead(isReceipts ? fetchReceiptExtras(supabase) : fetchPaymentExtras(supabase))

  const vouchers = await vouchersRead

  const { count: payrollRequestsPending } = payrollRequestsRead ? await payrollRequestsRead : { count: 0 }

  const claimRequestsPending = claimRequestsRead ? await claimRequestsRead : 0

  // Post-mig 238: PVS rows reference chart_of_accounts via account_code
  // (the COA `code` IS the GL). Load once, index by voucher_id, then derive
  // pool list + account name list for the table cells.
  const sourcesByVoucher = new Map<string, string[]>()
  const categoriesByVoucher = new Map<string, string[]>()
  {
    const { data: srcs } = await sourcesRead
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
  const extraRows: VoucherRow[] = await extraRowsRead
  const bankById = new Map<string, string>()
  if (banksRead) {
    const { data: banks } = await banksRead
    for (const b of (banks ?? []) as Array<{ id: string; bank_name: string }>) bankById.set(b.id, b.bank_name)
  }

  const all = vouchers ?? []
  const tab = statusFilter ?? 'all'
  const filters = { tab, typeFilter, poolFilter, fromFilter, toFilter, minFilter, maxFilter, qFilter }
  // The Payroll batches tab (2026-10-09): the payroll disbursements, which
  // VouchersTable folds under their batch, and nothing else.
  const payrollTab = tab === 'payroll'

  const extraFiltered = filterReceiptExtras(extraRows, filters)

  // The rows this account may open, and the payroll batches it may only see
  // by department (2026-10-13). The summary above the table still counts every
  // voucher.
  const open = seesPayroll ? all : all.filter((v) => !isPayrollReference(v.reference_type))
  const departmentNames = new Set<string>()
  if (departmentsRead) {
    const { data: depts } = await departmentsRead
    for (const d of (depts ?? []) as Array<{ name: string }>) departmentNames.add(d.name)
  }
  const allLocked = seesPayroll ? [] : lockPayrollBatches(all.filter((v) => isPayrollReference(v.reference_type)), departmentNames)
  // The Payroll batches tab holds the salary batches only, as it does for the
  // vouchers themselves; it is not a status, so the batches pass it whole.
  const lockedSalary = allLocked.filter((b) => b.referenceType === 'payroll_disbursement')
  const lockedBatches = payrollTab
    ? filterLockedBatches(lockedSalary, { ...filters, tab: 'all' })
    : filterLockedBatches(allLocked, filters)
  const lockedCount = lockedBatches.reduce((n, b) => n + b.count, 0)

  // Apply all filters in-memory. Summary stats below use `all` (unfiltered
  // context), only the table uses `filtered`.
  // A repayment PV is typed 'expense' in the DB — what marks it as a loan
  // repayment is the fund_source_id / legacy loan_id link. The "Loan
  // repayment" type filter matched voucher_type only, which NO voucher has,
  // so it always came back empty (user 2026-08-06: "无法找到那个payment
  // voucher"). Match the link instead.
  const isLoanRepay = (v: { fund_source_id?: string | null; loan_id?: string | null; voucher_type?: string | null }) =>
    v.fund_source_id != null || v.loan_id != null || v.voucher_type === 'loan_repayment'

  const filtered = open.filter((v) => {
    if (payrollTab) {
      if (v.reference_type !== 'payroll_disbursement') return false
    } else if (tab !== 'all' && v.status !== tab) return false
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
    // The day it was made in the office — on the server's clock (UTC) a voucher
    // made before 08:00 fell on the day before and slipped out of the range.
    const madeOn = dayjs(officeTime(v.created_at).format('YYYY-MM-DD'))
    if (fromFilter && madeOn.isBefore(dayjs(fromFilter), 'day')) return false
    if (toFilter && madeOn.isAfter(dayjs(toFilter), 'day')) return false
    if (minFilter !== null && Number(v.amount) < minFilter) return false
    if (maxFilter !== null && Number(v.amount) > maxFilter) return false
    if (qFilter) {
      const hay = `${v.voucher_no ?? ''} ${v.description ?? ''} ${v.payee_name ?? ''}${isLoanRepay(v) ? ' loan repayment 还款' : ''}`.toLowerCase()
      if (!hay.includes(qFilter)) return false
    }
    return true
  })

  // Payroll disbursements are one PV per person (26 a month); the description's
  // leading phrase ("Payroll disbursement Aug 2026" / "Director salary Aug
  // 2026") names the batch they collapse under in VouchersTable.
  const batchKeyOf = (v: { reference_type: string | null; description: string | null }) =>
    v.reference_type === 'payroll_disbursement' ? (v.description ?? 'Payroll disbursement').split(' — ')[0].trim() : undefined
  const batchCount =
    new Set(open.map(batchKeyOf).filter((k): k is string => !!k)).size + lockedSalary.length
  const counts = {
    all: all.length,
    draft: all.filter((v) => v.status === 'draft').length,
    pending_approval: all.filter((v) => v.status === 'pending_approval').length,
    approved: all.filter((v) => v.status === 'approved').length,
    paid: all.filter((v) => v.status === 'paid').length,
    voided: all.filter((v) => v.status === 'voided').length,
    // A tab of their own on the payment side (2026-10-09).
    ...(isReceipts ? {} : { payroll: batchCount }),
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

  // Waiting for a decision (draft + pending) and decided but not yet moved
  // (approved) are two different questions for Finance, so two cards (2026-10-07).
  const pendingAmount = all
    .filter((v) => ['draft', 'pending_approval'].includes(v.status))
    .reduce((sum, v) => sum + Number(v.amount), 0)
  const approvedAmount = all
    .filter((v) => v.status === 'approved')
    .reduce((sum, v) => sum + Number(v.amount), 0)

  const noun = isReceipts ? 'receipt' : 'voucher'
  const payrollPending = payrollRequestsPending ?? 0

  // The Payroll batches tab is headed by what it lists (2026-10-10, the
  // handoff): "Payroll batches · N BATCHES · M VOUCHERS".
  const shownBatches = new Set(filtered.map(batchKeyOf).filter((k): k is string => !!k)).size + lockedBatches.length
  const shownVouchers = filtered.length + lockedCount

  return (
    <div>
      {/* ───────── Header ───────── */}
      <div className="page-head">
        <div>
          {/* The month on the office's clock (2026-10-10, the handoff). */}
          <div className="page-eyebrow">
            <em>I.</em> DAILY OPERATIONS · {isReceipts ? 'OFFICIAL RECEIPTS' : 'PAYMENT VOUCHERS'} · {officeTime().format('MMMM YYYY').toUpperCase()}
          </div>
          <h1 className="page-title">{isReceipts ? 'Receipt' : 'Payments'}</h1>
        </div>
        {/* 2026-10-10 — the handoff's head: Dept Requests · Payroll Requests ·
            Create payment (Loan repayment received · Create receipt). The
            exports and Claim Requests are ours, kept. On a phone only the
            primary stays (.pay-act, CSS). */}
        <div className="flex flex-wrap items-center justify-end gap-3">
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
                  className="pay-act px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
                >
                  Export Excel
                </Link>
                <Link
                  href={`/payments/export?format=pdf&${exportQs}`}
                  className="pay-act px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
                >
                  Export PDF
                </Link>
              </>
            )
          })()}
          {/* Dept Requests answers to Treasury, as its page does — the same
              gate as this ledger's, so whoever is here may go there. */}
          {!isReceipts ? (
            <Link href="/payments/dept-requests" className={ACT}>
              Dept Requests
            </Link>
          ) : null}
          {!isReceipts && seesPayroll ? (
            <Link href="/payments/payroll-requests" className={payrollPending > 0 ? ACT_LIT : ACT}>
              Payroll Requests{payrollPending > 0 ? ` · ${payrollPending}` : ''}
            </Link>
          ) : null}
          {!isReceipts ? (
            <Link href="/payments/claim-requests" className={claimRequestsPending > 0 ? ACT_LIT : ACT}>
              Claim Requests{claimRequestsPending > 0 ? ` · ${claimRequestsPending}` : ''}
            </Link>
          ) : null}
          {canDo(user, 'treasury', 'create') ? (
            isReceipts ? (
              <>
                <Link
                  href="/payments/new?mode=loan_repayment"
                  className="pay-act bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
                >
                  Loan repayment received
                </Link>
                <Link href="/payments/new?mode=receipt" className={ACT_PRI}>
                  Create receipt
                </Link>
              </>
            ) : (
              <Link href="/payments/new" className={ACT_PRI}>
                Create payment
              </Link>
            )
          ) : null}
        </div>
      </div>

      {/* ───────── Summary cards (DESIGN.md › Sheet theme; user approved the
          Payments sample 2026-10-07). The paid total is the page's one primary;
          what is waiting reads as a warning only while something waits. ───────── */}
      <StatCards label={isReceipts ? 'Receipts' : 'Payments'}>
        {/* Money in is the green card, money out the page's primary (2026-10-10, the handoff). */}
        <StatCard
          tone={isReceipts ? 'ledger' : 'primary'}
          label={isReceipts ? 'Total received' : 'Total paid'}
          value={formatMoney(totalPaid)}
          icon={isReceipts ? 'in' : 'bank'}
          note={
            extraRows.length > 0
              ? isReceipts
                ? `${counts.paid} receipts · ${nRepayments} loan rpy · ${nFundIn} fund in`
                : `${counts.paid} PVs · ${nFsRepay} repayment${nFsRepay === 1 ? '' : 's'} · ${nLoanOut} loan out`
              : `${counts.paid} ${noun}${counts.paid === 1 ? '' : 's'} executed`
          }
        />
        <StatCard
          tone={counts.draft + counts.pending_approval > 0 ? 'wait' : 'default'}
          label="Pending approval"
          value={formatMoney(pendingAmount)}
          icon="clock"
          note={`${counts.draft} draft · ${counts.pending_approval} pending`}
        />
        <StatCard
          label={isReceipts ? 'Approved · to receive' : 'Approved · to pay'}
          value={formatMoney(approvedAmount)}
          icon="check"
          note={`${counts.approved} approved, not yet ${isReceipts ? 'received' : 'paid'}`}
        />
        <StatCard
          label={`All ${noun}s`}
          value={String(counts.all)}
          icon="layers"
          note={`${counts.voided} voided`}
        />
      </StatCards>

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
            <PaymentTabs counts={counts} />
          </Suspense>

          {/* The old filter row is gone (2026-10-10, the user: 照设计档) —
              the columns' ▽ filter category, pool, amount and date, and the
              table's search box finds the rest. An old ?q= / ?type= link
              still filters, below. */}
          <div className="sect-head">
            <h2>{payrollTab ? 'Payroll batches' : isReceipts ? 'Official receipts' : 'Payment vouchers'}</h2>
            <span className="rule" aria-hidden />
            {payrollTab ? (
              <span className="count">
                {shownBatches} {shownBatches === 1 ? 'batch' : 'batches'} · {shownVouchers} {shownVouchers === 1 ? 'voucher' : 'vouchers'}
              </span>
            ) : (
              <span className="count">
                {filtered.length + lockedCount + extraFiltered.length} of {all.length + extraRows.length} {noun}
                {all.length + extraRows.length === 1 ? '' : 's'}
                {tab !== 'all' ? ` · ${tab.replace('_', ' ')}` : ''}
              </span>
            )}
          </div>

          {filtered.length + lockedCount + extraFiltered.length === 0 ? (
            <div className="border border-hairline rounded-md bg-surface p-8 text-center">
              <p className="font-serif italic text-muted text-sm">
                No {tab.replace('_', ' ')} {noun}s.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <VouchersTable
                layoutId={isReceipts ? 'receipts.vouchers' : 'payments.vouchers'}
                layoutTitle={isReceipts ? 'Receipts' : 'Payments'}
                canSetDefault={user.role === 'finance' || user.role === 'principal'}
                side={isReceipts ? 'receipts' : 'payments'}
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
                  // Payroll disbursements are one PV per person (26 a month);
                  // the description's leading phrase ("Payroll disbursement
                  // Aug 2026" / "Director salary Aug 2026") names the batch
                  // they collapse under in VouchersTable.
                  const batchKey = batchKeyOf(v)
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
                    bankLabel: isReceipts && v.bank_account_id ? bankById.get(v.bank_account_id as string) : undefined,
                    batchKey,
                    // A paid voucher's date is corrected in place (改日期) — a
                    // draft or pending one with Edit, and payroll's from HR Payment.
                    amendDate:
                      v.status === 'paid' && v.payment_date && !isPayrollReference(v.reference_type)
                        ? { kind: 'voucher' as const, id: v.id, date: (v.payment_date as string).slice(0, 10) }
                        : undefined,
                  }
                }), ...lockedBatches.flatMap((b) => b.departments.map<VoucherRow>((d) => ({
                  // One row per department of the batch (2026-10-13): which
                  // department, how many, how much — folded under the batch.
                  id: `locked-${b.label}|${d.department}`,
                  voucher_no: null,
                  direction: 'debit',
                  amount: d.total,
                  payee_name: d.department,
                  status: d.statuses.length === 1 ? d.statuses[0] : 'mixed',
                  catLabel: 'Payroll',
                  poolLabel: '—',
                  description: `${b.label} · ${d.count} 张 · ${d.statusText}`,
                  paymentOrCreatedDate: d.latest,
                  batchKey: b.label,
                  locked: true,
                  // For the Finance view's English line (2026-10-10), and the
                  // batch's own count when its departments are put together.
                  lockedNote: { count: d.count, statusText: d.statusText, statusCounts: d.statusCounts },
                }))), ...extraFiltered]}
                // A text search must be able to land on one person's salary
                // PV, so the batches stay flat while ?q= is set.
                collapseBatches={!qFilter}
              />
            </div>
          )}
        </section>
      )}

      <BackToTop />
    </div>
  )
}
