'use client'

import { useTransition, useState } from 'react'
import { createPortal } from 'react-dom'
import { approveInvoice, approveInvoicesForPeriod, deleteDraftInvoice, updateDraftInvoice } from '../actions'
import AccountPicker, { type AccountOption } from '@/components/AccountPicker'
import type { AccountType } from '@/lib/coa'

const BILLING_MODE_OPTIONS = [
  { value: 'hr_attribution', label: 'HR attribution' },
  { value: 'finance_attribution', label: 'Finance attribution' },
  { value: 'director_office_attribution', label: 'Director Office attribution' },
  { value: 'director_attribution', label: 'Director attribution' },
  { value: 'marketing_project', label: 'Marketing project' },
  { value: 'venture_attribution', label: 'Venture attribution' },
]

const BILLABLE_TYPE_OPTIONS = [
  { value: 'subsidiary', label: 'Subsidiary' },
  { value: 'director', label: 'Director' },
  { value: 'dept_pool', label: 'Department (inter-billing)' },
  { value: 'freetext', label: 'Other party (free text)' },
]

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

// Edit a draft invoice — EVERY field is editable while draft (user
// 2026-06-12): amount, category, description, dates, reference, plus the
// structural fields (billing mode, who to bill, period). Drafts have no
// GL/pool footprint, so nothing needs unwinding. Rendered via createPortal
// to document.body so `fixed` centers on the VIEWPORT — inside the table it
// inherited a transformed ancestor and landed mid-document (user had to
// scroll to find it).
export function EditInvoiceButton({
  id,
  invoiceNo,
  initial,
  categories,
  companies = [],
  departments = [],
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
    billing_mode?: string | null
    billable_to_type?: string | null
    company_id?: string | null
    billable_to_department_id?: string | null
    billable_to_freetext_name?: string | null
    period_month?: string | null
  }
  categories: Array<{ code: string; label: string; type: AccountType; parent_code: string | null }>
  companies?: Array<{ id: string; name: string }>
  departments?: Array<{ id: string; name: string }>
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
  const [billingMode, setBillingMode] = useState(initial.billing_mode ?? 'venture_attribution')
  const [billableType, setBillableType] = useState(initial.billable_to_type ?? 'subsidiary')
  const [companyId, setCompanyId] = useState(initial.company_id ?? '')
  const [billableDeptId, setBillableDeptId] = useState(initial.billable_to_department_id ?? '')
  const [billableFreetext, setBillableFreetext] = useState(initial.billable_to_freetext_name ?? '')
  const [periodMonth, setPeriodMonth] = useState((initial.period_month ?? '').slice(0, 7))

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
    if (billableType === 'subsidiary' && !companyId) {
      setError('Pick the subsidiary to bill')
      return
    }
    if (billableType === 'dept_pool' && !billableDeptId) {
      setError('Pick the department to bill')
      return
    }
    if ((billableType === 'director' || billableType === 'freetext') && !billableFreetext.trim()) {
      setError('Billable party name is required')
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
        fd.set('billing_mode', billingMode)
        fd.set('billable_to_type', billableType)
        fd.set('company_id', companyId)
        fd.set('billable_to_department_id', billableDeptId)
        fd.set('billable_to_freetext_name', billableFreetext.trim())
        if (periodMonth) fd.set('period_month', `${periodMonth}-01`)
        await updateDraftInvoice(fd)
        setOpen(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  const modal = open ? (
    <div
      className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => !isPending && setOpen(false)}
    >
      <div
        className="bg-paper border border-hairline rounded-md shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between px-6 py-4 border-b border-hairline shrink-0">
          <div>
            <h2 className="font-serif text-2xl text-ink">Edit draft invoice</h2>
            <p className="font-serif italic text-graphite text-xs mt-1">
              {invoiceNo ?? id.slice(0, 8)} · drafts are fully editable — nothing is
              posted until you approve &amp; issue.
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

        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Bill to" required>
              <select
                value={billableType}
                onChange={(e) => setBillableType(e.target.value)}
                disabled={isPending}
                className={inputCls}
              >
                {BILLABLE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            {billableType === 'subsidiary' ? (
              <Field label="Subsidiary" required>
                <select
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  disabled={isPending}
                  className={inputCls}
                >
                  <option value="">Select…</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
            ) : billableType === 'dept_pool' ? (
              <Field label="Department" required>
                <select
                  value={billableDeptId}
                  onChange={(e) => setBillableDeptId(e.target.value)}
                  disabled={isPending}
                  className={inputCls}
                >
                  <option value="">Select…</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label={billableType === 'director' ? 'Director name' : 'Party name'} required>
                <input
                  type="text"
                  value={billableFreetext}
                  onChange={(e) => setBillableFreetext(e.target.value)}
                  disabled={isPending}
                  className={inputCls}
                />
              </Field>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Billing mode" required>
              <select
                value={billingMode}
                onChange={(e) => setBillingMode(e.target.value)}
                disabled={isPending}
                className={inputCls}
              >
                {BILLING_MODE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Period">
              <input
                type="month"
                value={periodMonth}
                onChange={(e) => setPeriodMonth(e.target.value)}
                disabled={isPending}
                className={`${inputCls} font-mono`}
              />
            </Field>
          </div>

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

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-hairline bg-surface shrink-0">
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
  ) : null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-graphite hover:text-ink font-serif italic"
      >
        Edit
      </button>
      {modal && typeof document !== 'undefined' ? createPortal(modal, document.body) : null}
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

