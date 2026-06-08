'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'
import { ApproveInvoiceButton, BulkIssueInvoicesButton, DeleteInvoiceButton, EditInvoiceButton } from './InvoiceActions'
import CreateCreditNoteButton from './CreateCreditNoteButton'
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
}

// Invoices for the selected period. Populated by Step 5's generate_monthly_invoices
// RPC. Until Step 5 ships, this section shows the empty state with an explanation.
export default function InvoicesList({ invoices, companyMap, departmentMap, period, categories = [], bankAccounts = [] }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showSettleModal, setShowSettleModal] = useState(false)
  const [settleBank, setSettleBank] = useState<string>('')
  const [settleDate, setSettleDate] = useState<string>(dayjs().format('YYYY-MM-DD'))
  const [settleError, setSettleError] = useState<string | null>(null)
  const [settleResult, setSettleResult] = useState<string | null>(null)

  // Only 'issued' subsidiary/freetext invoices are batch-settleable.
  // (Drafts need approval first; paid is done; dept_pool/inter-billing
  // needs the more involved single-voucher path.)
  function isBatchSettleable(inv: Invoice): boolean {
    return inv.status === 'issued' && inv.billable_to_type !== 'dept_pool'
  }

  const selectedInvoices = invoices.filter((i) => selectedIds.has(i.id) && isBatchSettleable(i))
  const selectedTotal = selectedInvoices.reduce((s, i) => s + Number(i.total_amount), 0)
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
    setSelectedIds(new Set(invoices.filter(isBatchSettleable).map((i) => i.id)))
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
    startTransition(async () => {
      try {
        const res = await settleInvoicesConsolidated({
          invoiceIds: ids,
          bankAccountId: settleBank,
          paymentDate: settleDate,
        })
        setSettleResult(`Receipt ${res.voucherNo} — settled ${res.settledCount} invoice(s).`)
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

      {invoices.length === 0 ? (
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
              rows={invoices}
              getRowKey={(inv) => inv.id}
              defaultSort={{ key: 'invoice_no', dir: 'desc' }}
              searchKeys={['invoice_no', 'company', 'billing_mode', 'description']}
              searchPlaceholder="Search invoice # / company / mode…"
              toolbarRight={
                invoices.some(isBatchSettleable) ? (
                  <>
                    <button
                      type="button"
                      onClick={selectAllIssued}
                      className="bg-surface hover:bg-surface-2 border border-hairline rounded-md px-3 py-1.5 text-xs font-sans text-ink transition-colors"
                    >
                      全选可结算发票
                    </button>
                    {selectedIds.size > 0 ? (
                      <button
                        type="button"
                        onClick={clearSelection}
                        className="text-xs font-sans text-muted hover:text-ink"
                      >
                        清除选择
                      </button>
                    ) : null}
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
                        }}
                        partyPrimary={labels.primary}
                        partySub={labels.sub}
                        categoryLabel={categoryLabel}
                        billingModeLabel={formatBillingMode(inv.billing_mode)}
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
                  render: (inv) => formatMoney(Number(inv.total_amount)),
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
                              }}
                              categories={categories ?? []}
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
                        ) : null}
                        {inv.status !== 'draft' ? (
                          <CreateCreditNoteButton
                            invoiceId={inv.id}
                            invoiceNo={inv.invoice_no}
                            invoiceTotal={Number(inv.total_amount)}
                            payeeLabel={labels.primary}
                            categories={categories}
                          />
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

      {/* Floating consolidated-settle action bar (bottom right). */}
      {selectedIds.size > 0 && !showSettleModal ? (
        <div className="fixed bottom-6 right-6 z-30 bg-paper border border-hairline rounded-md shadow-lg px-4 py-3 flex items-center gap-3">
          <div className="font-mono text-sm text-ink">
            {selectedIds.size} 张 · <span className="font-semibold">RM {selectedTotal.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</span>
          </div>
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
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            打印所选 {selectedIds.size} 张
          </button>
          <button
            type="button"
            onClick={openSettleModal}
            disabled={selectedInvoices.length === 0 || crossCompany}
            title={crossCompany ? '一张收据只能结同一家公司的单' : undefined}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {crossCompany ? '不同公司不能合并' : `合并结算 ${selectedInvoices.length} 张 → 生成收据`}
          </button>
        </div>
      ) : null}

      {/* Batch-settle modal */}
      {showSettleModal ? (
        <div
          className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => !isPending && setShowSettleModal(false)}
        >
          <div
            className="bg-paper border border-hairline rounded-md shadow-xl w-full max-w-lg my-12"
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
