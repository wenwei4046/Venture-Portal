'use client'

import { useState } from 'react'
import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'

export interface InvoiceDetail {
  id: string
  invoice_no: string | null
  period_month: string
  billing_mode: string
  total_amount: number
  status: string
  description: string | null
  invoice_date: string | null
  due_date: string | null
  reference_no: string | null
  category_code: string | null
  created_at: string | null
  /** Freetext bill-to contact details (mig 225 polymorphism). */
  freetext_address?: string | null
  freetext_phone?: string | null
  freetext_email?: string | null
}

export interface InvoiceReceiptRow {
  voucherNo: string | null
  date: string | null
  amount: number
  /** true = a consolidated receipt that settled several invoices at once —
   *  its amount is the whole receipt, not just this invoice's slice. */
  batch?: boolean
}

export interface InvoiceCnRow {
  cnNo: string | null
  amount: number
  status: string
  reason: string | null
}

interface Props {
  invoice: InvoiceDetail
  partyPrimary: string
  partySub: string
  categoryLabel?: string
  billingModeLabel: string
  /** Line items (multi-line invoices). */
  lines?: Array<{ description: string | null; amount: number; category_code: string | null }>
  /** code → account name, to label line categories. */
  categoryLabels?: Record<string, string>
  /** Receipts recorded against this invoice (direct + batch settlement). */
  receipts?: InvoiceReceiptRow[]
  /** Credit notes raised against this invoice (any status). */
  creditNotes?: InvoiceCnRow[]
}

/**
 * Clickable invoice number cell that opens a read-only detail modal. There is
 * no dedicated invoice detail page, so this popup carries EVERYTHING (user
 * 2026-08-29: "最好是显示到完全部资料"): header fields, freetext contact,
 * line items, receipts, credit notes and the outstanding balance.
 */
export default function InvoiceDetailButton({
  invoice,
  partyPrimary,
  partySub,
  categoryLabel,
  billingModeLabel,
  lines = [],
  categoryLabels = {},
  receipts = [],
  creditNotes = [],
}: Props) {
  const [open, setOpen] = useState(false)
  const label = invoice.invoice_no ?? invoice.id.slice(0, 8)

  const isPaid = invoice.status === 'paid' || invoice.status === 'paid_via_netting'
  const cnApproved = creditNotes
    .filter((c) => c.status === 'approved')
    .reduce((s, c) => s + c.amount, 0)
  const directReceipts = receipts.filter((r) => !r.batch).reduce((s, r) => s + r.amount, 0)
  const outstanding = isPaid
    ? 0
    : Math.max(0, Math.round((invoice.total_amount - directReceipts - cnApproved) * 100) / 100)

  const statusColor =
    invoice.status === 'draft'
      ? 'text-graphite'
      : invoice.status === 'issued'
        ? 'text-alert'
        : isPaid
          ? 'text-ledger'
          : 'text-muted'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-mono text-xs text-graphite hover:text-accent transition-colors underline-offset-2 hover:underline cursor-pointer"
      >
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-scrim/45 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-paper border border-hairline rounded-panel shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between px-6 py-4 border-b border-hairline">
              <div>
                <div className="font-serif italic text-accent text-xs mb-1">
                  Invoice · <span className={statusColor}>{invoice.status.replace(/_/g, ' ')}</span>
                </div>
                <h2 className="font-serif text-2xl text-ink">{label}</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-muted hover:text-ink text-2xl leading-none pt-1"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <div className="font-mono text-[11px] uppercase tracking-wide text-graphite mb-1">
                  Description
                </div>
                {invoice.description?.trim() ? (
                  <p className="font-serif text-ink text-sm whitespace-pre-wrap">
                    {invoice.description}
                  </p>
                ) : (
                  <p className="font-serif italic text-muted text-sm">— no description on this invoice —</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Billed to" primary={partyPrimary} sub={partySub} />
                <Field label="Billing mode" primary={billingModeLabel} />
                <Field
                  label="Invoice date"
                  primary={invoice.invoice_date ? dayjs(invoice.invoice_date).format('D MMM YYYY') : '—'}
                />
                <Field
                  label="Due date"
                  primary={invoice.due_date ? dayjs(invoice.due_date).format('D MMM YYYY') : '—'}
                />
                <Field
                  label="Period"
                  primary={dayjs(invoice.period_month).format('MMMM YYYY')}
                />
                <Field
                  label="Total amount"
                  primary={formatMoney(Number(invoice.total_amount))}
                  primaryClass="font-mono tabular text-num-ink"
                />
                {categoryLabel ? (
                  <Field
                    label="GL category"
                    primary={categoryLabel}
                    sub={invoice.category_code ?? undefined}
                  />
                ) : null}
                {invoice.reference_no ? (
                  <Field label="Reference no" primary={invoice.reference_no} />
                ) : null}
              </div>

              {invoice.freetext_address || invoice.freetext_phone || invoice.freetext_email ? (
                <div className="bg-surface border border-hairline rounded-md px-4 py-3">
                  <div className="font-mono text-[11px] uppercase tracking-wide text-graphite mb-1.5">
                    Contact
                  </div>
                  {invoice.freetext_address ? (
                    <div className="font-serif text-sm text-ink whitespace-pre-wrap">{invoice.freetext_address}</div>
                  ) : null}
                  <div className="font-mono text-xs text-muted mt-1">
                    {[invoice.freetext_phone, invoice.freetext_email].filter(Boolean).join(' · ')}
                  </div>
                </div>
              ) : null}

              {lines.length > 0 ? (
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-wide text-graphite mb-1.5">
                    明细 · Line items ({lines.length})
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {lines.map((l, i) => (
                        <tr key={i} className="border-b border-hairline/60 last:border-0">
                          <td className="py-1.5 pr-3 font-serif text-ink align-top">
                            {l.description?.trim() || <span className="italic text-muted">line {i + 1}</span>}
                            {l.category_code ? (
                              <span className="block font-mono text-[11px] text-muted">
                                {l.category_code}
                                {categoryLabels[l.category_code] ? ` · ${categoryLabels[l.category_code]}` : ''}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-1.5 font-mono tabular text-right text-num-ink whitespace-nowrap align-top">
                            {formatMoney(l.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {receipts.length > 0 ? (
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-wide text-graphite mb-1.5">
                    收款记录 · Receipts ({receipts.length})
                  </div>
                  <div className="space-y-1">
                    {receipts.map((r, i) => (
                      <div key={i} className="flex items-baseline justify-between text-sm">
                        <span className="font-mono text-xs text-graphite">
                          {r.voucherNo ?? '—'}
                          {r.date ? ` · ${dayjs(r.date).format('D MMM YYYY')}` : ''}
                          {r.batch ? (
                            <span className="text-muted italic"> · 合并收据(含其他发票)</span>
                          ) : null}
                        </span>
                        <span className="font-mono tabular text-ledger whitespace-nowrap">
                          +{formatMoney(r.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {creditNotes.length > 0 ? (
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-wide text-graphite mb-1.5">
                    Credit notes ({creditNotes.length})
                  </div>
                  <div className="space-y-1">
                    {creditNotes.map((c, i) => (
                      <div key={i} className="flex items-baseline justify-between text-sm">
                        <span className="font-mono text-xs text-graphite">
                          {c.cnNo ?? '—'} · <span className={c.status === 'approved' ? 'text-ledger' : c.status === 'voided' ? 'text-danger' : 'text-muted'}>{c.status}</span>
                          {c.reason ? <span className="text-muted"> · {c.reason}</span> : null}
                        </span>
                        <span className="font-mono tabular text-num-ink whitespace-nowrap">
                          −{formatMoney(c.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="bg-surface border border-hairline rounded-md px-4 py-3 flex items-baseline justify-between">
                <span className="font-serif italic text-graphite text-sm">
                  已收 {formatMoney(directReceipts)}
                  {cnApproved > 0 ? ` · CN −${formatMoney(cnApproved)}` : ''}
                </span>
                <span className={`font-mono tabular text-sm font-semibold ${outstanding > 0 ? 'text-danger' : 'text-ledger'}`}>
                  {isPaid ? '已收清 ✓' : outstanding > 0 ? `未收 ${formatMoney(outstanding)}` : '已收清 ✓'}
                </span>
              </div>

              {invoice.created_at ? (
                <div className="pt-3 border-t border-hairline font-mono text-[11px] text-muted">
                  Created {dayjs(invoice.created_at).format('D MMM YYYY · HH:mm')}
                </div>
              ) : null}
            </div>

            <div className="px-6 py-3 border-t border-hairline flex justify-end">
              <button
                onClick={() => setOpen(false)}
                className="text-sm font-sans text-muted hover:text-ink"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Field({
  label,
  primary,
  sub,
  primaryClass,
}: {
  label: string
  primary: string
  sub?: string
  primaryClass?: string
}) {
  return (
    <div>
      <div className="font-mono text-[11px] uppercase tracking-wide text-graphite mb-1">
        {label}
      </div>
      <div className={primaryClass ?? 'font-serif text-ink text-sm'}>{primary}</div>
      {sub ? <div className="font-mono text-xs text-muted">{sub}</div> : null}
    </div>
  )
}
