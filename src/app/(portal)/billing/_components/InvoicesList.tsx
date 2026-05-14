'use client'

import Link from 'next/link'
import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'
import { ApproveInvoiceButton, BulkIssueInvoicesButton } from './InvoiceActions'
import CreateCreditNoteButton from './CreateCreditNoteButton'
import SortableTable, { type SortableColumn } from '@/components/SortableTable'

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
    type: 'revenue' | 'cost' | 'other_income'
    parent_code: string | null
  }>
}

// Invoices for the selected period. Populated by Step 5's generate_monthly_invoices
// RPC. Until Step 5 ships, this section shows the empty state with an explanation.
export default function InvoicesList({ invoices, companyMap, departmentMap, period, categories = [] }: Props) {
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
              searchKeys={['invoice_no', 'company', 'billing_mode']}
              searchPlaceholder="Search invoice # / company / mode…"
              columns={[
                {
                  key: 'invoice_no',
                  label: 'Invoice #',
                  render: (inv) => inv.invoice_no ?? inv.id.slice(0, 8),
                  sortValue: (inv) => inv.invoice_no ?? inv.id,
                  cellClassName: 'font-mono text-xs text-muted',
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
                },
                {
                  key: 'billing_mode',
                  label: 'Mode',
                  render: (inv) => formatBillingMode(inv.billing_mode),
                  sortValue: (inv) => formatBillingMode(inv.billing_mode),
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
                        {inv.status === 'draft' ? (
                          <ApproveInvoiceButton id={inv.id} />
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
