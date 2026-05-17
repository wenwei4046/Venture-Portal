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
}

interface Props {
  invoice: InvoiceDetail
  partyPrimary: string
  partySub: string
  categoryLabel?: string
  billingModeLabel: string
}

/**
 * Clickable invoice number cell that opens a read-only detail modal showing
 * description + dates + reference. Issued invoices have no dedicated detail
 * page (per the /statements tab reorder) so this lightweight popup is the
 * primary way to inspect what's behind an invoice row.
 */
export default function InvoiceDetailButton({
  invoice,
  partyPrimary,
  partySub,
  categoryLabel,
  billingModeLabel,
}: Props) {
  const [open, setOpen] = useState(false)
  const label = invoice.invoice_no ?? invoice.id.slice(0, 8)

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
          className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-paper border border-hairline rounded-md shadow-xl w-full max-w-xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between px-6 py-4 border-b border-hairline">
              <div>
                <div className="font-serif italic text-accent text-xs mb-1">
                  Invoice · {invoice.status}
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
