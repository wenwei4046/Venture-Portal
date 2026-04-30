'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createCreditNote } from '../actions'

interface Props {
  invoiceId: string
  invoiceNo: string | null
  invoiceTotal: number
  /** Label shown for the party being credited. Already resolved by the parent
   *  list (subsidiary name OR free-text/dept name from Item 5 polymorphism). */
  payeeLabel: string
}

// Minimal credit-note modal — the credit note inherits its billable target
// from the parent invoice, so the user just confirms amount + reason.
export default function CreateCreditNoteButton({
  invoiceId,
  invoiceNo,
  invoiceTotal,
  payeeLabel,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')

  function reset() {
    setAmount('')
    setReason('')
    setError(null)
  }

  function handleSubmit() {
    setError(null)
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Amount must be a positive number')
      return
    }
    if (amt > invoiceTotal + 0.005) {
      setError(`Cannot exceed invoice total (RM ${invoiceTotal.toFixed(2)})`)
      return
    }
    if (!reason.trim()) {
      setError('Reason is required')
      return
    }

    startTransition(async () => {
      const fd = new FormData()
      fd.set('invoice_id', invoiceId)
      fd.set('amount', amt.toFixed(2))
      fd.set('reason', reason.trim())
      try {
        await createCreditNote(fd)
        setOpen(false)
        reset()
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create credit note')
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-graphite hover:text-accent font-serif italic transition-colors"
      >
        + Credit note
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !isPending && setOpen(false)}
        >
          <div
            className="bg-paper border border-hairline rounded-md shadow-xl w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between px-6 py-4 border-b border-hairline">
              <div>
                <h2 className="font-serif text-2xl text-ink">Credit note</h2>
                <p className="font-serif italic text-graphite text-xs mt-1">
                  Reduces what {payeeLabel} owes against this invoice.
                </p>
              </div>
              <button
                onClick={() => !isPending && setOpen(false)}
                disabled={isPending}
                className="text-muted hover:text-ink text-2xl leading-none pt-1 disabled:opacity-50"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="bg-surface border border-hairline rounded-md p-4 text-sm">
                <div className="flex items-baseline justify-between">
                  <span className="font-serif italic text-graphite">Invoice</span>
                  <span className="font-mono tabular text-ink">{invoiceNo ?? '—'}</span>
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="font-serif italic text-graphite">Bill to</span>
                  <span className="font-serif text-ink">{payeeLabel}</span>
                </div>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="font-serif italic text-graphite">Invoice total</span>
                  <span className="font-mono tabular text-ink">
                    RM {invoiceTotal.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <label className="block">
                <div className="text-xs font-sans font-medium text-graphite mb-1">
                  Credit amount <span className="text-danger">*</span>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                  disabled={isPending}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-right text-ink focus:outline-none focus:border-accent-border"
                />
                <div className="font-serif italic text-muted text-xs mt-1">
                  Cannot exceed the invoice total.
                </div>
              </label>

              <label className="block">
                <div className="text-xs font-sans font-medium text-graphite mb-1">
                  Reason <span className="text-danger">*</span>
                </div>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  disabled={isPending}
                  placeholder="Why is this credit being raised?"
                  className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
                />
              </label>

              {error ? (
                <div className="bg-danger/10 border border-danger/30 text-danger rounded-md px-3 py-2 text-sm font-sans">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-hairline bg-surface">
              <button
                onClick={() => !isPending && setOpen(false)}
                disabled={isPending}
                className="text-sm font-sans text-muted hover:text-ink disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isPending}
                className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50"
              >
                {isPending ? 'Creating…' : 'Create Credit Note'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
