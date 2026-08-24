'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateDeptInvoice, deleteDeptInvoice } from '../actions'

// Edit / delete a dept manager's OWN draft invoice (2026-08-24). RLS is the
// hard gate (draft + own segment + created_by self); this is just the UI.

interface Props {
  invoice: {
    id: string
    invoice_no: string | null
    total_amount: number
    invoice_date: string | null
    due_date: string | null
    description: string | null
  }
}

const inputCls =
  'w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border disabled:opacity-50'

export default function DraftInvoiceActions({ invoice }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [amount, setAmount] = useState(String(invoice.total_amount))
  const [invoiceDate, setInvoiceDate] = useState(invoice.invoice_date ?? '')
  const [dueDate, setDueDate] = useState(invoice.due_date ?? '')
  const [description, setDescription] = useState(invoice.description ?? '')

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('id', invoice.id)
      fd.set('amount', amount)
      fd.set('invoice_date', invoiceDate)
      fd.set('due_date', dueDate)
      fd.set('description', description)
      const r = await updateDeptInvoice(fd)
      if (r.error) setError(r.error)
      else {
        setOpen(false)
        router.refresh()
      }
    })
  }

  function handleDelete() {
    if (
      !window.confirm(
        `Delete draft ${invoice.invoice_no ?? 'invoice'}?\n\n还没 issue,删掉不影响任何账。`,
      )
    )
      return
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('id', invoice.id)
      const r = await deleteDeptInvoice(fd)
      if (r.error) setError(r.error)
      else router.refresh()
    })
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={() => setOpen(true)}
        disabled={isPending}
        className="text-xs text-accent hover:text-accent-hover font-serif italic disabled:opacity-50"
      >
        Edit
      </button>
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="text-xs text-graphite hover:text-danger font-serif italic disabled:opacity-50"
      >
        Delete
      </button>
      {error && !open ? <span className="text-xs text-danger font-sans">{error}</span> : null}

      {open ? (
        <div
          className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !isPending && setOpen(false)}
        >
          <div
            className="bg-paper border border-hairline rounded-md shadow-xl w-full max-w-md text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between px-6 py-4 border-b border-hairline">
              <h2 className="font-serif text-xl text-ink">Edit draft · {invoice.invoice_no ?? ''}</h2>
              <button
                onClick={() => !isPending && setOpen(false)}
                className="text-muted hover:text-ink text-2xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <label className="block">
                <div className="text-xs font-sans font-medium text-graphite mb-1">Amount (RM)</div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                  disabled={isPending}
                  className={inputCls + ' font-mono tabular text-right'}
                />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <div className="text-xs font-sans font-medium text-graphite mb-1">Invoice date</div>
                  <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} disabled={isPending} className={inputCls} />
                </label>
                <label className="block">
                  <div className="text-xs font-sans font-medium text-graphite mb-1">Due date</div>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={isPending} className={inputCls} />
                </label>
              </div>
              <label className="block">
                <div className="text-xs font-sans font-medium text-graphite mb-1">Description</div>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} disabled={isPending} className={inputCls + ' resize-y'} />
              </label>
              {error ? (
                <div className="bg-danger/10 border border-danger/30 text-danger rounded-md px-3 py-2 text-sm font-sans">{error}</div>
              ) : null}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button onClick={() => !isPending && setOpen(false)} disabled={isPending} className="text-sm font-sans text-muted hover:text-ink disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={isPending} className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50">
                  {isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </span>
  )
}
