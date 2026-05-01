import Link from 'next/link'
import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'
import { ApproveInvoiceButton, BulkIssueInvoicesButton } from './InvoiceActions'
import CreateCreditNoteButton from './CreateCreditNoteButton'

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
  period: string
  /** Phase 11: payment_categories for credit-note multi-pool routing. */
  categories?: Array<{ code: string; label: string }>
}

// Invoices for the selected period. Populated by Step 5's generate_monthly_invoices
// RPC. Until Step 5 ships, this section shows the empty state with an explanation.
export default function InvoicesList({ invoices, companyMap, period, categories = [] }: Props) {
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
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
                  <th className="text-left py-3 pr-4 font-medium">Invoice #</th>
                  <th className="text-left py-3 pr-4 font-medium">Company</th>
                  <th className="text-left py-3 pr-4 font-medium">Mode</th>
                  <th className="text-right py-3 pr-4 font-medium">Amount</th>
                  <th className="text-left py-3 pr-4 font-medium">Status</th>
                  <th className="text-right py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  // Item 5: render the actual billable party. For subsidiary
                  // we look up the company; for the other 3 types we show the
                  // freetext / department label sitting on the invoice row.
                  const company = inv.company_id ? companyMap.get(inv.company_id) : undefined
                  let primaryLabel = company?.name ?? '—'
                  let subLabel = company?.code ?? ''
                  if (!inv.company_id) {
                    primaryLabel = inv.billable_to_freetext_name ?? '—'
                    subLabel =
                      inv.billable_to_type === 'director'
                        ? 'Director'
                        : inv.billable_to_type === 'dept_pool'
                          ? 'Dept pool'
                          : inv.billable_to_type === 'freetext'
                            ? 'Free text'
                            : '—'
                  }
                  return (
                    <tr
                      key={inv.id}
                      className="border-b border-hairline last:border-0"
                    >
                      <td className="py-3 pr-4 font-mono text-xs text-muted">
                        {inv.invoice_no ?? inv.id.slice(0, 8)}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="font-serif text-md text-ink">
                          {primaryLabel}
                        </div>
                        <div className="font-mono text-xs text-muted">
                          {subLabel}
                        </div>
                      </td>
                      <td className="py-3 pr-4 font-serif italic text-graphite text-sm">
                        {formatBillingMode(inv.billing_mode)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono tabular font-medium text-ink">
                        {formatMoney(Number(inv.total_amount))}
                      </td>
                      <td className="py-3 pr-4">
                        <InvoiceStatus status={inv.status} />
                      </td>
                      <td className="py-3 text-right">
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
                              payeeLabel={primaryLabel}
                              categories={categories}
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
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
