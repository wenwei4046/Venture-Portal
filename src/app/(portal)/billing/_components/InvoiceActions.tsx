'use client'

import { useMemo, useTransition, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  approveInvoice,
  approveInvoicesForPeriod,
  deleteDraftInvoice,
  updateDraftInvoiceFull,
  type BillableToKind,
  type CreateInvoiceMode,
} from '../actions'
import AccountPicker, { type AccountOption } from '@/components/AccountPicker'
import type { AccountType } from '@/lib/coa'

// Same option sets as the create forms — the edit modal mirrors them 1:1.
const BILLABLE_OPTIONS: Array<{ value: BillableToKind; label: string }> = [
  { value: 'subsidiary', label: 'Subsidiary' },
  { value: 'director',   label: 'Director' },
  { value: 'dept_pool',  label: 'Dept Pool' },
  { value: 'freetext',   label: 'Other' },
]

const POOL_OPTIONS: Array<{ value: CreateInvoiceMode; label: string }> = [
  { value: 'venture_attribution',         label: 'Venture Pool' },
  { value: 'marketing_project',           label: 'Marketing Department Pool' },
  { value: 'hr_attribution',              label: 'HR Department Pool' },
  { value: 'finance_attribution',         label: 'Finance Department Pool' },
  { value: 'director_office_attribution', label: 'Director Office Department Pool' },
  { value: 'director_attribution',        label: 'Director Department Pool' },
]

interface EditLineRow {
  uid: string
  description: string
  amount: string
  categoryCode: string
}

function newEditLine(): EditLineRow {
  return { uid: crypto.randomUUID(), description: '', amount: '', categoryCode: '' }
}

function fmtRm(n: number): string {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

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

// Edit a draft invoice — the modal mirrors the CREATE form 1:1 (user
// 2026-06-12): bill-to segment buttons, pool/billing mode, period, LINE
// ITEMS (add/remove — multi-line invoices edit their lines here), dates,
// header description, reference. Drafts have no GL/pool footprint, so
// everything is editable; the format follows the line count (2+ lines =
// multi-line invoice, 1 line = simple invoice), exactly like creating.
// Rendered via createPortal(document.body) so `fixed` centers on the
// VIEWPORT — inside the table it inherited a transformed ancestor and
// landed mid-document (user had to scroll to find it).
export function EditInvoiceButton({
  id,
  invoiceNo,
  initial,
  initialLines = [],
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
  initialLines?: Array<{ description: string | null; amount: number; category_code: string | null }>
  categories: Array<{ code: string; label: string; type: AccountType; parent_code: string | null }>
  companies?: Array<{ id: string; name: string }>
  departments?: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const isMultiSource = initialLines.length > 0

  const [billableType, setBillableType] = useState<BillableToKind>(
    (initial.billable_to_type as BillableToKind) ?? 'subsidiary',
  )
  const [companyId, setCompanyId] = useState(initial.company_id ?? '')
  const [deptId, setDeptId] = useState(initial.billable_to_department_id ?? '')
  const [freetextName, setFreetextName] = useState(initial.billable_to_freetext_name ?? '')
  const [billingMode, setBillingMode] = useState<CreateInvoiceMode>(
    (initial.billing_mode as CreateInvoiceMode) ?? 'venture_attribution',
  )
  const [period, setPeriod] = useState((initial.period_month ?? '').slice(0, 7))
  const [invoiceDate, setInvoiceDate] = useState(initial.invoice_date ?? '')
  const [dueDate, setDueDate] = useState(initial.due_date ?? '')
  // Multi-line source: the header description is the summary. Simple source:
  // the single line carries the description, header stays blank (matching
  // what saving 1 line writes back).
  const [headerDescription, setHeaderDescription] = useState(
    isMultiSource ? initial.description ?? '' : '',
  )
  const [referenceNo, setReferenceNo] = useState(initial.reference_no ?? '')
  const [lines, setLines] = useState<EditLineRow[]>(() =>
    isMultiSource
      ? initialLines.map((l) => ({
          uid: crypto.randomUUID(),
          description: l.description ?? '',
          amount: String(l.amount),
          categoryCode: l.category_code ?? '',
        }))
      : [
          {
            uid: crypto.randomUUID(),
            description: initial.description ?? '',
            amount: String(initial.total_amount ?? ''),
            categoryCode: initial.category_code ?? '',
          },
        ],
  )

  const categoryOptions: AccountOption[] = useMemo(
    () =>
      categories.map((c) => ({
        code: c.code,
        name: c.label,
        type: c.type,
        parent_code: c.parent_code,
        is_active: true,
      })),
    [categories],
  )

  const total = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.amount) || 0), 0),
    [lines],
  )

  function updateLine(uid: string, patch: Partial<EditLineRow>) {
    setLines((prev) => prev.map((l) => (l.uid === uid ? { ...l, ...patch } : l)))
  }
  function addLine() {
    setLines((prev) => [...prev, newEditLine()])
  }
  function removeLine(uid: string) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.uid !== uid)))
  }

  function handleSubmit() {
    setError(null)
    if (billableType === 'subsidiary' && !companyId) return setError('Pick a subsidiary')
    if (billableType === 'dept_pool' && !deptId) return setError('Pick a department')
    if ((billableType === 'director' || billableType === 'freetext') && !freetextName.trim()) {
      return setError(billableType === 'director' ? 'Enter director name' : 'Enter party name')
    }
    const validLines = lines.filter((l) => Number(l.amount) > 0 && l.description.trim())
    if (validLines.length === 0) {
      return setError('Add at least one line with description + amount')
    }

    startTransition(async () => {
      try {
        await updateDraftInvoiceFull({
          id,
          billableType,
          billingMode,
          period,
          invoiceDate,
          dueDate,
          referenceNo,
          headerDescription,
          companyId: billableType === 'subsidiary' ? companyId : undefined,
          departmentId: billableType === 'dept_pool' ? deptId : undefined,
          freetextName:
            billableType === 'director' || billableType === 'freetext' ? freetextName.trim() : undefined,
          lines: validLines.map((l) => ({
            description: l.description.trim(),
            amount: Number(l.amount),
            categoryCode: l.categoryCode.trim(),
          })),
        })
        setOpen(false)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed')
      }
    })
  }

  const modal = open ? (
    <div
      className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => !isPending && setOpen(false)}
    >
      <div
        className="bg-paper border border-hairline rounded-md shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between px-6 py-4 border-b border-hairline shrink-0">
          <div>
            <h2 className="font-serif text-2xl text-ink">Edit draft invoice</h2>
            <p className="font-serif italic text-graphite text-xs mt-1">
              {invoiceNo ?? id.slice(0, 8)} · drafts are fully editable — nothing posts
              until approve &amp; issue. 2+ lines saves as a multi-line invoice.
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
          {/* Bill-to type — same segment buttons as the create form */}
          <div>
            <div className="text-xs font-sans font-medium text-graphite mb-1">
              Bill to <span className="text-danger">*</span>
            </div>
            <div className="flex flex-wrap gap-0 border border-hairline rounded-md overflow-hidden w-fit">
              {BILLABLE_OPTIONS.map((opt, i) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setBillableType(opt.value)}
                  disabled={isPending}
                  className={
                    billableType === opt.value
                      ? 'px-4 py-2 bg-accent-bg text-accent font-serif italic text-sm'
                      : `px-4 py-2 text-graphite font-sans text-sm hover:bg-surface-2${i > 0 ? ' border-l border-hairline' : ''}`
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {billableType === 'subsidiary' ? (
            <Field label="Subsidiary" required>
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                disabled={isPending}
                className={inputCls}
              >
                <option value="">Select subsidiary…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
          ) : billableType === 'dept_pool' ? (
            <Field label="Department" required>
              <select
                value={deptId}
                onChange={(e) => setDeptId(e.target.value)}
                disabled={isPending}
                className={inputCls}
              >
                <option value="">Select a department…</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </Field>
          ) : (
            <Field
              label={billableType === 'director' ? 'Director name' : 'Bill to (free text)'}
              required
            >
              <input
                type="text"
                value={freetextName}
                onChange={(e) => setFreetextName(e.target.value)}
                disabled={isPending}
                maxLength={120}
                className={inputCls}
              />
            </Field>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Pool / billing mode" required>
              <select
                value={billingMode}
                onChange={(e) => setBillingMode(e.target.value as CreateInvoiceMode)}
                disabled={isPending}
                className={inputCls}
              >
                {POOL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Period" required>
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                disabled={isPending}
                className={`${inputCls} font-mono`}
              />
            </Field>
          </div>

          {/* Line items — identical to the multi-line create form */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-xs font-sans font-medium text-graphite">
                Line items <span className="text-danger">*</span>
              </div>
              <span className="font-serif italic text-muted text-xs">
                {lines.length} {lines.length === 1 ? 'line' : 'lines'} · Total RM {fmtRm(total)}
              </span>
            </div>

            <div className="space-y-3">
              {lines.map((l, idx) => (
                <div key={l.uid} className="border border-hairline rounded-md bg-surface p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="text-xs font-mono uppercase tracking-wide text-muted">Line {idx + 1}</div>
                    <button
                      onClick={() => removeLine(l.uid)}
                      disabled={isPending || lines.length === 1}
                      className="text-muted hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed text-lg leading-none"
                      aria-label="Remove line"
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                  <div className="space-y-3">
                    <Field label="Description" required>
                      <input
                        type="text"
                        value={l.description}
                        onChange={(e) => updateLine(l.uid, { description: e.target.value })}
                        disabled={isPending}
                        placeholder="What is this line for?"
                        className={inputCls}
                      />
                    </Field>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Field label="Category">
                        <AccountPicker
                          accounts={categoryOptions}
                          value={l.categoryCode}
                          onChange={(code) => updateLine(l.uid, { categoryCode: code })}
                          name={`edit_line_cat_${l.uid}`}
                          placeholder="Select category…"
                          disabled={isPending}
                        />
                      </Field>
                      <Field label="Amount (RM)" required>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={l.amount}
                          onChange={(e) => updateLine(l.uid, { amount: e.target.value.replace(/[^\d.]/g, '') })}
                          placeholder="0.00"
                          disabled={isPending}
                          className={`${inputCls} font-mono tabular text-right`}
                        />
                      </Field>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={addLine}
              disabled={isPending}
              className="mt-3 text-xs font-sans text-accent hover:text-accent-hover underline-offset-2 hover:underline"
              type="button"
            >
              + Add line
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Invoice date" required>
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

          <Field
            label="Header description (optional)"
            hint="Shows as the invoice summary; per-line descriptions are the detail. With a single line, the line description is used."
          >
            <textarea
              value={headerDescription}
              onChange={(e) => setHeaderDescription(e.target.value)}
              rows={2}
              disabled={isPending}
              className={`${inputCls} resize-y`}
            />
          </Field>

          <Field label="Reference no" hint="PO number, contract ref — optional">
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

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-hairline bg-surface shrink-0">
          <div className="font-serif italic text-muted text-xs">
            {lines.filter((l) => Number(l.amount) > 0 && l.description.trim()).length} valid line(s) · Total RM {fmtRm(total)}
          </div>
          <div className="flex items-center gap-3">
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
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <div className="text-xs font-sans font-medium text-graphite mb-1">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </div>
      {children}
      {hint && <div className="font-serif italic text-muted text-xs mt-1">{hint}</div>}
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

