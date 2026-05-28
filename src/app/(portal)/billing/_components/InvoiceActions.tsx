'use client'

import { useTransition, useState } from 'react'
import { approveInvoice, approveInvoicesForPeriod, deleteDraftInvoice, updateDraftInvoice } from '../actions'
import AccountPicker, { type AccountOption } from '@/components/AccountPicker'
import type { AccountType } from '@/lib/coa'

export function ApproveInvoiceButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handle() {
    setError(null)
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('id', id)
        await approveInvoice(fd)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <div className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={handle}
        disabled={isPending}
        className="text-xs text-accent hover:text-accent-hover font-serif italic disabled:opacity-50"
      >
        {isPending ? 'Issuing…' : 'Approve & issue'}
      </button>
      {error ? <span className="text-xs text-danger font-sans mt-1">{error}</span> : null}
    </div>
  )
}

// Delete a draft invoice. Confirms via a JS prompt — keeping the surface
// small since this is a recoverable-mistake-fix path, not a destructive one
// (only drafts can be deleted; issued/paid invoices stay locked).
export function DeleteInvoiceButton({ id, invoiceNo }: { id: string; invoiceNo: string | null }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handle() {
    setError(null)
    if (!confirm(`Delete draft invoice ${invoiceNo ?? id.slice(0, 8)}? This cannot be undone.`)) return
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('id', id)
        await deleteDraftInvoice(fd)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <div className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={handle}
        disabled={isPending}
        className="text-xs text-danger hover:opacity-80 font-serif italic disabled:opacity-50"
      >
        {isPending ? 'Deleting…' : 'Delete'}
      </button>
      {error ? <span className="text-xs text-danger font-sans mt-1">{error}</span> : null}
    </div>
  )
}

// Edit a draft invoice — modal with the soft fields (amount, category,
// description, dates, reference). Structural fields (billing_mode, who-to-
// bill, company, period_month) are intentionally locked; for those the user
// should delete + recreate.
export function EditInvoiceButton({
  id,
  invoiceNo,
  initial,
  categories,
}: {
  id: string
  invoiceNo: string | null
  initial: {
    total_amount: number
    category_code: string | null
    description: string | null
    invoice_date: string | null
    due_date: string | null
    reference_no: string | null
  }
  categories: Array<{ code: string; label: string; type: AccountType; parent_code: string | null }>
}) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [amount, setAmount] = useState(String(initial.total_amount ?? ''))
  const [categoryCode, setCategoryCode] = useState(initial.category_code ?? '')
  const [description, setDescription] = useState(initial.description ?? '')
  const [invoiceDate, setInvoiceDate] = useState(initial.invoice_date ?? '')
  const [dueDate, setDueDate] = useState(initial.due_date ?? '')
  const [referenceNo, setReferenceNo] = useState(initial.reference_no ?? '')

  const categoryOptions: AccountOption[] = categories.map((c) => ({
    code: c.code,
    name: c.label,
    type: c.type,
    parent_code: c.parent_code,
    is_active: true,
  }))

  function handleSubmit() {
    setError(null)
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Amount must be a positive number')
      return
    }
    if (!description.trim()) {
      setError('Description is required')
      return
    }
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('id', id)
        fd.set('amount', amt.toFixed(2))
        fd.set('category_code', categoryCode.trim())
        fd.set('description', description.trim())
        fd.set('invoice_date', invoiceDate)
        fd.set('due_date', dueDate)
        fd.set('reference_no', referenceNo.trim())
        await updateDraftInvoice(fd)
        setOpen(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-graphite hover:text-ink font-serif italic"
      >
        Edit
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !isPending && setOpen(false)}
        >
          <div
            className="bg-paper border border-hairline rounded-md shadow-xl w-full max-w-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between px-6 py-4 border-b border-hairline">
              <div>
                <h2 className="font-serif text-2xl text-ink">Edit draft invoice</h2>
                <p className="font-serif italic text-graphite text-xs mt-1">
                  {invoiceNo ?? id.slice(0, 8)} · only soft fields editable; for structural
                  changes delete + recreate.
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
              <Field label="Amount (RM)" required>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                  disabled={isPending}
                  className={`${inputCls} font-mono tabular text-right`}
                />
              </Field>

              <Field label="Category">
                <AccountPicker
                  accounts={categoryOptions}
                  value={categoryCode}
                  onChange={setCategoryCode}
                  name="category_picker"
                  placeholder="Select category…"
                  disabled={isPending}
                />
              </Field>

              <Field label="Description" required>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  disabled={isPending}
                  className={`${inputCls} resize-y`}
                />
              </Field>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Invoice date">
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    disabled={isPending}
                    className={`${inputCls} font-mono`}
                  />
                </Field>
                <Field label="Due date">
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    disabled={isPending}
                    className={`${inputCls} font-mono`}
                  />
                </Field>
              </div>

              <Field label="Reference no">
                <input
                  type="text"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  disabled={isPending}
                  className={inputCls}
                />
              </Field>

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
                {isPending ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

const inputCls =
  'w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border disabled:opacity-50 disabled:cursor-not-allowed'

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <div className="text-xs font-sans font-medium text-graphite mb-1">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </div>
      {children}
    </label>
  )
}

export function BulkIssueInvoicesButton({ period, count }: { period: string; count: number }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handle() {
    setError(null)
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('period_month', period)
        await approveInvoicesForPeriod(fd)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <div className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={handle}
        disabled={isPending}
        className="text-xs bg-accent text-white px-3 py-1 rounded-md font-serif italic hover:bg-accent-hover disabled:opacity-50"
      >
        {isPending ? 'Issuing…' : `Approve all ${count} drafts`}
      </button>
      {error ? <span className="text-xs text-danger font-sans mt-1">{error}</span> : null}
    </div>
  )
}

