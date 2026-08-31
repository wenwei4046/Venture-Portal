'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'
import { ApproveInvoiceButton, BulkIssueInvoicesButton, DeleteInvoiceButton, EditInvoiceButton } from './InvoiceActions'
import CreateCreditNoteButton from './CreateCreditNoteButton'
import ReassignInvoiceGlButton from './ReassignInvoiceGlButton'
import CopyInvoiceButton from './CopyInvoiceButton'
import InvoiceDetailButton from './InvoiceDetailButton'
import SortableTable from '@/components/SortableTable'
import type { AccountType } from '@/lib/coa'
import { settleInvoicesConsolidated } from '../actions'
import { payeeKey } from '@/lib/invoice-settlement'

interface Invoice {
  id: string
  invoice_no: string | null
  company_id: string | null
  period_month: string
  billing_mode: string
  total_amount: number
  status: string
  // Item 5: 4-way billable target. Subsidiary still uses company_id;
  // others use these polymorphic columns.
  billable_to_type?: 'subsidiary' | 'director' | 'dept_pool' | 'freetext' | null
  billable_to_department_id?: string | null
  billable_to_freetext_name?: string | null
  billable_to_freetext_address?: string | null
  billable_to_freetext_phone?: string | null
  billable_to_freetext_email?: string | null
  // Detail-modal fields (read-only). No per-invoice detail page exists, so
  // these power the click-into-row popup.
  description?: string | null
  invoice_date?: string | null
  due_date?: string | null
  reference_no?: string | null
  category_code?: string | null
  created_at?: string | null
}

// Resolve the "who is being billed" label for an invoice row. Mig 225's
// 4-way polymorphism (subsidiary / director / dept_pool / freetext)
// means the label source varies per row, so this is centralised so the
// table cell, the sort key, and the credit-note payee field all stay in
// sync.
function resolvePartyLabel(
  inv: Invoice,
  companyMap: Map<string, { name: string; code: string }>,
  departmentMap: Map<string, string>,
): { primary: string; sub: string } {
  if (inv.company_id) {
    const company = companyMap.get(inv.company_id)
    return { primary: company?.name ?? '—', sub: company?.code ?? '' }
  }
  if (inv.billable_to_type === 'dept_pool' && inv.billable_to_department_id) {
    return {
      primary: departmentMap.get(inv.billable_to_department_id) ?? '—',
      sub: 'Dept pool',
    }
  }
  const primary = inv.billable_to_freetext_name ?? '—'
  const sub =
    inv.billable_to_type === 'director'
      ? 'Director'
      : inv.billable_to_type === 'dept_pool'
        ? 'Dept pool'
        : inv.billable_to_type === 'freetext'
          ? 'Free text'
          : '—'
  return { primary, sub }
}

// Humanize the billing mode enum values for UI display — raw snake_case
// reads like a dev dump.
function formatBillingMode(mode: string): string {
  switch (mode) {
    case 'marketing_project':
      return 'Marketing project'
    case 'director_office_attribution':
      return 'Director Office OPEX'
    case 'director_attribution':
      return 'Director OPEX'
    case 'non_billable':
      return 'Non-billable'
    case 'payroll_consolidated':
      return 'Payroll (consolidated)'
    default:
      return mode
  }
}

interface Props {
  invoices: Invoice[]
  companyMap: Map<string, { name: string; code: string }>
  /** Mig 225: dept_pool invoices resolve their party label from this map
   *  (billable_to_department_id → department name). Subsidiary invoices use
   *  companyMap; director/freetext invoices use the freetext name on the row. */
  departmentMap: Map<string, string>
  period: string
  /** Phase 11 / post-unified-COA + mig 246: chart_of_accounts rows for
   *  credit-note multi-pool routing. type + parent_code let AccountPicker
   *  filter to revenue-side leaves only. */
  categories?: Array<{
    code: string
    label: string
    type: AccountType
    parent_code: string | null
  }>
  /** Banks shown in the batch-settle modal. Drives which bank account
   *  receives the inflow when knocking off multiple issued invoices. */
  bankAccounts?: Array<{ id: string; bank_name: string; account_number: string | null }>
  /** invoice_id → line items, prefills the (create-form-mirroring) edit modal. */
  invoiceLines?: Record<string, Array<{ description: string | null; amount: number; category_code: string | null }>>
  /** invoice_id → Σ receipts already recorded (partial payments). Issued
   *  invoices settle for their REMAINING balance; part-paid rows get a badge. */
  paidByInvoice?: Record<string, number>
  /** invoice_id → Σ APPROVED credit notes (CN v2, 2026-08-19) — reduces the
   *  settle balance exactly like receipts do. */
  cnByInvoice?: Record<string, number>
  /** 跨月合并结算 (2026-08-20): OTHER periods' still-issued invoices. Hidden
   *  until the 跨月 toggle is on, then they join the list so one receipt can
   *  cover a payer's invoices across months. Period totals ignore them. */
  extraOpenInvoices?: Invoice[]
  /** invoice_id → receipts recorded against it (detail-modal 收款记录). */
  receiptsByInvoice?: Record<string, Array<{ voucherNo: string | null; date: string | null; amount: number; batch?: boolean }>>
  /** invoice_id → credit notes raised against it (detail modal, any status). */
  cnDetailByInvoice?: Record<string, Array<{ cnNo: string | null; amount: number; status: string; reason: string | null }>>
  /** Dynamically provisioned dept modes — forwarded to the CN modal. */
  extraModes?: Array<{ value: string; label: string }>
}

// Invoices for the selected period. Populated by Step 5's generate_monthly_invoices
// RPC. Until Step 5 ships, this section shows the empty state with an explanation.
export default function InvoicesList({ invoices, companyMap, departmentMap, period, categories = [], bankAccounts = [], invoiceLines = {}, paidByInvoice = {}, cnByInvoice = {}, extraOpenInvoices = [], extraModes = [], receiptsByInvoice = {}, cnDetailByInvoice = {} }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // code → account name, labels the detail modal's line categories.
  const catLabelByCode: Record<string, string> = Object.fromEntries(
    categories.map((c) => [c.code, c.label]),
  )
  // 跨月: reveal other periods' unsettled invoices in the same list.
  const [showAllOpen, setShowAllOpen] = useState(false)
  const displayRows = showAllOpen ? [...invoices, ...extraOpenInvoices] : invoices
  const [showSettleModal, setShowSettleModal] = useState(false)
  const [settleBank, setSettleBank] = useState<string>('')
  const [settleDate, setSettleDate] = useState<string>(dayjs().format('YYYY-MM-DD'))
  const [settleAmount, setSettleAmount] = useState<string>('')
  const [settleError, setSettleError] = useState<string | null>(null)
  const [settleResult, setSettleResult] = useState<string | null>(null)

  // Partial payments: what an issued invoice still owes.
  const remainingOf = (inv: Invoice) =>
    Math.round(
      (Number(inv.total_amount) - (paidByInvoice[inv.id] ?? 0) - (cnByInvoice[inv.id] ?? 0)) * 100,
    ) / 100

  // Only 'issued' subsidiary/freetext invoices are batch-settleable.
  // (Drafts need approval first; paid is done; dept_pool/inter-billing
  // needs the more involved single-voucher path.)
  function isBatchSettleable(inv: Invoice): boolean {
    return inv.status === 'issued' && inv.billable_to_type !== 'dept_pool'
  }

  const selectedInvoices = displayRows.filter((i) => selectedIds.has(i.id) && isBatchSettleable(i))
  // Batch settle collects the REMAINING balance of each invoice, not the
  // printed total (they differ once partial receipts exist).
  const selectedTotal = selectedInvoices.reduce((s, i) => s + remainingOf(i), 0)
  // A consolidated receipt covers one payer only. Detect mixed selections so
  // the UI can warn + block before the server rejects.
  const selectedPayeeKeys = new Set(
    selectedInvoices.map((i) =>
      payeeKey({
        id: i.id,
        status: i.status,
        billable_to_type: i.billable_to_type ?? null,
        company_id: i.company_id ?? null,
        billable_to_freetext_name: i.billable_to_freetext_name ?? null,
        total_amount: i.total_amount,
      }),
    ),
  )
  const crossCompany = selectedPayeeKeys.size > 1

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function selectAllIssued() {
    setSelectedIds(new Set(displayRows.filter(isBatchSettleable).map((i) => i.id)))
  }
  function clearSelection() {
    setSelectedIds(new Set())
  }

  // Batch print: open a multi-page PDF of the selected invoices (the invoice-doc
  // route already supports ?ids=a,b,c → one document page per invoice).
  function printSelected() {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    window.open(`/billing/invoice-doc?ids=${ids.join(',')}`, '_blank', 'noopener,noreferrer')
  }

  function openSettleModal() {
    setSettleError(null)
    setSettleResult(null)
    // Default bank to the first one (usually primary) if none chosen
    if (!settleBank && bankAccounts.length > 0) setSettleBank(bankAccounts[0].id)
    // Single invoice → editable received amount (partial payments); default
    // to the full remaining balance.
    setSettleAmount(
      selectedInvoices.length === 1 ? remainingOf(selectedInvoices[0]).toFixed(2) : '',
    )
    setShowSettleModal(true)
  }

  function handleBatchSettle() {
    setSettleError(null)
    setSettleResult(null)
    if (!settleBank) return setSettleError('Pick a bank account')
    if (!settleDate) return setSettleError('Pick a payment date')
    if (crossCompany) return setSettleError('一张收据只能结同一家公司的单，请只勾选同一家公司的发票')
    const ids = selectedInvoices.map((i) => i.id)
    if (ids.length === 0) return setSettleError('No settleable invoices selected')
    let partialAmount: number | undefined
    if (selectedInvoices.length === 1) {
      const remaining = remainingOf(selectedInvoices[0])
      const amt = Number(settleAmount)
      if (!Number.isFinite(amt) || amt <= 0) return setSettleError('实收金额必须大于 0')
      if (amt > remaining + 0.005)
        return setSettleError(`实收金额超过发票余额 RM ${remaining.toFixed(2)}`)
      partialAmount = amt
    }
    startTransition(async () => {
      try {
        const res = await settleInvoicesConsolidated({
          invoiceIds: ids,
          bankAccountId: settleBank,
          paymentDate: settleDate,
          partialAmount,
        })
        setSettleResult(
          res.isPartial
            ? `Receipt ${res.voucherNo} — 部分收款 RM ${res.total.toFixed(2)}，发票保持未结，余额还剩 RM ${(remainingOf(selectedInvoices[0]) - res.total).toFixed(2)}。`
            : `Receipt ${res.voucherNo} — settled ${res.settledCount} invoice(s).`,
        )
        setSelectedIds(new Set())
        setShowSettleModal(false)
        router.refresh()
      } catch (err) {
        setSettleError(err instanceof Error ? err.message : 'Consolidated settle failed')
      }
    })
  }
  const totalsByMode = new Map<string, number>()
  const totalsByCompany = new Map<string, number>()
  let grandTotal = 0
  let draftCount = 0
  for (const inv of invoices) {
    const amt = Number(inv.total_amount)
    grandTotal += amt
    totalsByMode.set(inv.billing_mode, (totalsByMode.get(inv.billing_mode) ?? 0) + amt)
    // Item 5: company_id is null for non-subsidiary invoices. Bucket those
    // under the freetext / dept name instead so totals don't crash.
    const bucketKey = inv.company_id ?? `__${inv.billable_to_type ?? 'unknown'}__`
    totalsByCompany.set(bucketKey, (totalsByCompany.get(bucketKey) ?? 0) + amt)
    if (inv.status === 'draft') draftCount++
  }

  return (
    <section className="border-t border-hairline pt-8 mb-12">
      <div className="flex items-baseline justify-between mb-4 gap-4 flex-wrap">
        <h2 className="font-serif text-xl text-ink">Invoices</h2>
        <div className="flex items-baseline gap-4">
          <div className="font-mono text-xs text-muted">
            {dayjs(period).format('MMMM YYYY')} · {invoices.length}{' '}
            {invoices.length === 1 ? 'invoice' : 'invoices'}
            {draftCount > 0 ? ` · ${draftCount} draft` : ''}
          </div>
          {draftCount > 0 ? (
            <BulkIssueInvoicesButton period={period} count={draftCount} />
          ) : null}
        </div>
      </div>

      {invoices.length === 0 && extraOpenInvoices.length === 0 ? (
        <div className="border border-hairline rounded-md bg-surface p-6 text-center">
          <p className="font-serif italic text-muted text-sm">
            No invoices generated for this period yet. Finance generates them from
            the HR cost submission + billing configs (Step 5 <em>Generate invoices</em>
            button lands next).
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 mb-6 pb-6 border-b border-hairline">
            <div className="lg:col-span-7">
              <div className="font-serif italic text-accent text-base mb-1">
                Total for {dayjs(period).format('MMMM YYYY')}
              </div>
              <div className="font-serif text-[44px] md:text-hero text-ink leading-none">
                {formatMoney(grandTotal)}
              </div>
            </div>
            <div className="lg:col-span-5 space-y-1.5">
              {Array.from(totalsByMode.entries()).map(([mode, total]) => (
                <div
                  key={mode}
                  className="flex items-baseline justify-between font-mono text-sm"
                >
                  <em className="font-serif text-graphite text-sm">{formatBillingMode(mode)}</em>
                  <span className="text-graphite tabular">{formatMoney(total)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <SortableTable<Invoice>
              rows={displayRows}
              getRowKey={(inv) => inv.id}
              defaultSort={{ key: 'invoice_no', dir: 'desc' }}
              searchKeys={['invoice_no', 'company', 'billing_mode', 'description']}
              searchPlaceholder="Search invoice # / company / mode…"
              toolbarRight={
                displayRows.some(isBatchSettleable) || extraOpenInvoices.length > 0 ? (
                  <>
                    {/* Selection summary + batch actions — inline in the toolbar
                        (between search and 全选), not a floating bar (user 2026-06-11). */}
                    {selectedIds.size > 0 && !showSettleModal ? (
                      <div className="flex items-center gap-2.5 bg-paper border border-hairline rounded-md px-3 py-1">
                        <span className="font-mono text-xs text-ink whitespace-nowrap">
                          {selectedIds.size} 张 ·{' '}
                          <span className="font-semibold">
                            RM {selectedTotal.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={clearSelection}
                          className="text-xs font-sans text-muted hover:text-ink"
                        >
                          清除
                        </button>
                        <button
                          type="button"
                          onClick={printSelected}
                          className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-xs font-sans px-3 py-1 rounded-md transition-colors whitespace-nowrap"
                        >
                          打印所选 {selectedIds.size} 张
                        </button>
                        <button
                          type="button"
                          onClick={openSettleModal}
                          disabled={selectedInvoices.length === 0 || crossCompany}
                          title={crossCompany ? '一张收据只能结同一家公司的单' : undefined}
                          className="bg-accent hover:bg-accent-hover text-white text-xs font-sans px-3 py-1 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {crossCompany ? '不同公司不能合并' : `合并结算 ${selectedInvoices.length} 张 → 生成收据`}
                        </button>
                      </div>
                    ) : null}
                    {extraOpenInvoices.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setShowAllOpen((v) => !v)}
                        title="同一家公司跨月的未结发票可以一起勾选、开一张收据"
                        className={`border rounded-md px-3 py-1.5 text-xs font-sans transition-colors whitespace-nowrap ${
                          showAllOpen
                            ? 'bg-accent text-white border-accent hover:bg-accent-hover'
                            : 'bg-surface hover:bg-surface-2 border-hairline text-ink'
                        }`}
                      >
                        {showAllOpen ? '只看本月' : `跨月：其他月份未结 +${extraOpenInvoices.length}`}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={selectAllIssued}
                      className="bg-surface hover:bg-surface-2 border border-hairline rounded-md px-3 py-1.5 text-xs font-sans text-ink transition-colors whitespace-nowrap"
                    >
                      全选可结算发票
                    </button>
                  </>
                ) : undefined
              }
              columns={[
                {
                  key: '_select',
                  label: '',
                  sortable: false,
                  render: (inv) => {
                    const settleable = isBatchSettleable(inv)
                    return (
                      <input
                        type="checkbox"
                        disabled={!settleable || isPending}
                        checked={selectedIds.has(inv.id)}
                        onChange={() => toggle(inv.id)}
                        className="accent-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label={settleable ? `Select ${inv.invoice_no ?? 'invoice'}` : 'Not settleable in batch'}
                      />
                    )
                  },
                },
                {
                  key: 'invoice_no',
                  label: 'Invoice #',
                  render: (inv) => {
                    const labels = resolvePartyLabel(inv, companyMap, departmentMap)
                    const categoryLabel = inv.category_code
                      ? categories.find((c) => c.code === inv.category_code)?.label
                      : undefined
                    return (
                      <InvoiceDetailButton
                        invoice={{
                          id: inv.id,
                          invoice_no: inv.invoice_no,
                          period_month: inv.period_month,
                          billing_mode: inv.billing_mode,
                          total_amount: Number(inv.total_amount),
                          status: inv.status,
                          description: inv.description ?? null,
                          invoice_date: inv.invoice_date ?? null,
                          due_date: inv.due_date ?? null,
                          reference_no: inv.reference_no ?? null,
                          category_code: inv.category_code ?? null,
                          created_at: inv.created_at ?? null,
                          freetext_address: inv.billable_to_freetext_address ?? null,
                          freetext_phone: inv.billable_to_freetext_phone ?? null,
                          freetext_email: inv.billable_to_freetext_email ?? null,
                        }}
                        partyPrimary={labels.primary}
                        partySub={labels.sub}
                        categoryLabel={categoryLabel}
                        billingModeLabel={formatBillingMode(inv.billing_mode)}
                        lines={invoiceLines[inv.id] ?? []}
                        categoryLabels={catLabelByCode}
                        receipts={receiptsByInvoice[inv.id] ?? []}
                        creditNotes={cnDetailByInvoice[inv.id] ?? []}
                      />
                    )
                  },
                  sortValue: (inv) => inv.invoice_no ?? inv.id,
                },
                {
                  key: 'company',
                  label: 'Company',
                  render: (inv) => {
                    const labels = resolvePartyLabel(inv, companyMap, departmentMap)
                    return (
                      <>
                        <div className="font-serif text-md text-ink">{labels.primary}</div>
                        <div className="font-mono text-xs text-muted">{labels.sub}</div>
                      </>
                    )
                  },
                  sortValue: (inv) => resolvePartyLabel(inv, companyMap, departmentMap).primary,
                  filterValue: (inv) => resolvePartyLabel(inv, companyMap, departmentMap).primary,
                  filterable: true,
                },
                {
                  key: 'description',
                  label: 'Description',
                  render: (inv) => {
                    const d = inv.description?.trim()
                    if (!d) return <span className="text-muted">—</span>
                    const firstLine = d.split(/\r?\n/)[0]
                    const text = firstLine.length > 48 ? `${firstLine.slice(0, 48)}…` : firstLine
                    return <span title={d}>{text}</span>
                  },
                  sortValue: (inv) => inv.description ?? '',
                  filterValue: (inv) => inv.description ?? '',
                  filterable: true,
                  cellClassName: 'font-serif italic text-graphite text-sm',
                },
                {
                  key: 'billing_mode',
                  label: 'Mode',
                  render: (inv) => formatBillingMode(inv.billing_mode),
                  sortValue: (inv) => formatBillingMode(inv.billing_mode),
                  filterable: true,
                  cellClassName: 'font-serif italic text-graphite text-sm',
                },
                {
                  key: 'total_amount',
                  label: 'Amount',
                  align: 'right',
                  render: (inv) => {
                    const paid = paidByInvoice[inv.id] ?? 0
                    const credited = cnByInvoice[inv.id] ?? 0
                    if (inv.status !== 'issued' || (paid <= 0 && credited <= 0)) {
                      return formatMoney(Number(inv.total_amount))
                    }
                    return (
                      <div>
                        <div>{formatMoney(Number(inv.total_amount))}</div>
                        <div className="font-mono text-[11px] text-alert">
                          {paid > 0 ? `part-paid ${formatMoney(paid)} · ` : ''}
                          {credited > 0 ? `CN −${formatMoney(credited)} · ` : ''}
                          bal {formatMoney(remainingOf(inv))}
                        </div>
                      </div>
                    )
                  },
                  sortValue: (inv) => Number(inv.total_amount),
                  cellClassName: 'font-mono tabular font-medium text-ink',
                },
                {
                  key: 'status',
                  label: 'Status',
                  render: (inv) => <InvoiceStatus status={inv.status} />,
                  sortValue: (inv) => inv.status,
                  filterable: true,
                },
                {
                  key: 'action',
                  label: 'Action',
                  sortable: false,
                  align: 'right',
                  render: (inv) => {
                    const labels = resolvePartyLabel(inv, companyMap, departmentMap)
                    return (
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/billing/invoice-doc?id=${inv.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-graphite hover:text-accent font-serif italic"
                          title="Download single-invoice PDF"
                        >
                          PDF
                        </Link>
                        <CopyInvoiceButton id={inv.id} invoiceNo={inv.invoice_no} />
                        {inv.status === 'draft' ? (
                          <>
                            <EditInvoiceButton
                              id={inv.id}
                              invoiceNo={inv.invoice_no}
                              initial={{
                                total_amount: Number(inv.total_amount),
                                category_code: inv.category_code ?? null,
                                description: inv.description ?? null,
                                invoice_date: inv.invoice_date ?? null,
                                due_date: inv.due_date ?? null,
                                reference_no: inv.reference_no ?? null,
                                billing_mode: inv.billing_mode ?? null,
                                billable_to_type: inv.billable_to_type ?? null,
                                company_id: inv.company_id ?? null,
                                billable_to_department_id: inv.billable_to_department_id ?? null,
                                billable_to_freetext_name: inv.billable_to_freetext_name ?? null,
                                billable_to_freetext_address: inv.billable_to_freetext_address ?? null,
                                billable_to_freetext_phone: inv.billable_to_freetext_phone ?? null,
                                billable_to_freetext_email: inv.billable_to_freetext_email ?? null,
                                period_month: inv.period_month ?? null,
                              }}
                              initialLines={invoiceLines[inv.id] ?? []}
                              categories={categories ?? []}
                              companies={Array.from(companyMap, ([cid, c]) => ({ id: cid, name: c.name }))}
                              departments={Array.from(departmentMap, ([did, dname]) => ({ id: did, name: dname }))}
                            />
                            <DeleteInvoiceButton id={inv.id} invoiceNo={inv.invoice_no} />
                            <ApproveInvoiceButton id={inv.id} />
                          </>
                        ) : inv.status === 'issued' ? (
                          <Link
                            href={`/payments/new?invoice_id=${inv.id}`}
                            className="text-xs text-accent hover:text-accent-hover font-serif italic"
                          >
                            Settle →
                          </Link>
                        ) : inv.status === 'paid' ? (
                          <Link
                            href={`/payments/new?mode=refund&invoice_id=${inv.id}`}
                            className="text-xs text-muted hover:text-danger font-serif italic"
                            title="退款:开一张 debit PV 把已收的钱退回去(正常审批流程)"
                          >
                            Refund →
                          </Link>
                        ) : null}
                        {inv.status !== 'draft' ? (
                          <>
                            <CreateCreditNoteButton
                              invoiceId={inv.id}
                              invoiceNo={inv.invoice_no}
                              invoiceTotal={Number(inv.total_amount)}
                              payeeLabel={labels.primary}
                              categories={categories}
                              extraModes={extraModes}
                            />
                            <ReassignInvoiceGlButton
                              invoiceId={inv.id}
                              invoiceNo={inv.invoice_no}
                              currentCategory={inv.category_code ?? null}
                              categories={categories.map((c) => ({ code: c.code, label: c.label }))}
                            />
                          </>
                        ) : null}
                      </div>
                    )
                  },
                },
              ]}
            />
          </div>
        </>
      )}

      {/* Batch-settle modal */}
      {showSettleModal ? (
        <div
          className="fixed inset-0 z-50 bg-scrim/45 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => !isPending && setShowSettleModal(false)}
        >
          <div
            className="bg-paper border border-hairline rounded-panel shadow-xl w-full max-w-lg my-12"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between px-6 py-4 border-b border-hairline">
              <div>
                <h2 className="font-serif text-2xl text-ink">合并结算 · 生成收据</h2>
                <p className="font-serif italic text-graphite text-xs mt-1">
                  {selectedInvoices.length} 张发票 · RM {selectedTotal.toLocaleString('en-MY', { minimumFractionDigits: 2 })}。
                  合并为一张收款凭证（Official Receipt），所选发票全部标记为已付。
                </p>
              </div>
              <button
                onClick={() => !isPending && setShowSettleModal(false)}
                disabled={isPending}
                className="text-muted hover:text-ink text-2xl leading-none pt-1 disabled:opacity-50"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <label className="block">
                <div className="text-xs font-sans font-medium text-graphite mb-1">
                  Bank account <span className="text-danger">*</span>
                </div>
                <select
                  value={settleBank}
                  onChange={(e) => setSettleBank(e.target.value)}
                  disabled={isPending}
                  className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
                >
                  <option value="">Select bank…</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bank_name}{b.account_number ? ` · ${b.account_number}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <div className="text-xs font-sans font-medium text-graphite mb-1">
                  Payment date <span className="text-danger">*</span>
                </div>
                <input
                  type="date"
                  value={settleDate}
                  onChange={(e) => setSettleDate(e.target.value)}
                  disabled={isPending}
                  className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink font-mono focus:outline-none focus:border-accent-border"
                />
              </label>
              {selectedInvoices.length === 1 ? (
                <label className="block">
                  <div className="text-xs font-sans font-medium text-graphite mb-1">
                    实收金额 (RM) <span className="text-danger">*</span>
                  </div>
                  <input
                    type="text"
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    disabled={isPending}
                    className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink font-mono tabular focus:outline-none focus:border-accent-border"
                  />
                  <p className="text-[11px] font-sans text-muted mt-1">
                    发票余额 RM {remainingOf(selectedInvoices[0]).toFixed(2)}
                    {paidByInvoice[selectedInvoices[0].id] ? (
                      <>（已收 RM {(paidByInvoice[selectedInvoices[0].id] ?? 0).toFixed(2)}）</>
                    ) : null}
                    　·　少于余额 = 部分收款，发票保持未结，之后可以继续收。
                  </p>
                </label>
              ) : null}
              <div className="text-xs font-mono text-muted">
                Invoices to settle:
              </div>
              <ul className="max-h-48 overflow-y-auto text-xs font-mono space-y-1 border border-hairline rounded-md p-2 bg-surface">
                {selectedInvoices.map((inv) => (
                  <li key={inv.id} className="flex justify-between">
                    <span>{inv.invoice_no ?? inv.id.slice(0, 8)}</span>
                    <span className="tabular">RM {Number(inv.total_amount).toLocaleString('en-MY', { minimumFractionDigits: 2 })}</span>
                  </li>
                ))}
              </ul>
              {settleError ? (
                <div className="bg-danger/10 border border-danger/30 text-danger rounded-md px-3 py-2 text-sm font-sans">
                  {settleError}
                </div>
              ) : null}
              {settleResult ? (
                <div className="bg-surface border border-hairline rounded-md px-3 py-2 text-sm font-sans">
                  {settleResult}
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-hairline bg-surface">
              <button
                onClick={() => !isPending && setShowSettleModal(false)}
                disabled={isPending}
                className="text-sm font-sans text-muted hover:text-ink disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBatchSettle}
                disabled={isPending || selectedInvoices.length === 0 || crossCompany}
                className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending ? '结算中…' : `生成收据 · 结 ${selectedInvoices.length} 张`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function InvoiceStatus({ status }: { status: string }) {
  if (status === 'draft') return <em className="font-serif text-graphite text-sm">draft</em>
  if (status === 'issued') return <em className="font-serif text-alert text-sm">issued</em>
  if (status === 'paid') return <em className="font-serif text-ledger text-sm">paid</em>
  if (status === 'paid_via_netting')
    return <em className="font-serif text-ledger text-sm">paid via netting</em>
  return <em className="font-serif text-muted text-sm">{status}</em>
}
