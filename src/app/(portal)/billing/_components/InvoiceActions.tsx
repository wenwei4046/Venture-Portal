'use client'

import { useMemo, useTransition, useState } from 'react'
import { backdropDismiss } from '@/components/modal-dismiss'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  approveInvoice,
  approveInvoicesForPeriod,
  deleteDraftInvoice,
  updateDraftInvoiceFull,
  updateIssuedInvoiceFull,
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
  autoOpen = false,
  hideTrigger = false,
  status = 'draft',
  settled = false,
}: {
  /** Opened from the row menu (2026-10-02): the dialog starts open and the
   *  component draws no trigger of its own. */
  autoOpen?: boolean
  hideTrigger?: boolean
  /** The invoice's status. An issued (or paid) invoice is edited with the same
   *  form (2026-10-07, user: "invoice edit 我要全部都可以改"), with a reason, and
   *  the entry posted at issue is corrected in place. */
  status?: string
  /** Money has come in against it: the amount, the payer and the period are fixed. */
  settled?: boolean
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
    billable_to_freetext_address?: string | null
    billable_to_freetext_phone?: string | null
    billable_to_freetext_email?: string | null
    period_month?: string | null
  }
  initialLines?: Array<{ description: string | null; amount: number; category_code: string | null }>
  categories: Array<{ code: string; label: string; type: AccountType; parent_code: string | null }>
  companies?: Array<{ id: string; name: string }>
  departments?: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(autoOpen)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const issued = status !== 'draft'
  const locked = issued && settled
  const [reason, setReason] = useState('')

  // Dynamic departments (2026-08-24): an invoice on a provisioned dept's own
  // billing mode keeps that mode visible in the edit select.
  const poolOptions =
    initial.billing_mode && !POOL_OPTIONS.some((o) => o.value === initial.billing_mode)
      ? [...POOL_OPTIONS, { value: initial.billing_mode as CreateInvoiceMode, label: initial.billing_mode }]
      : POOL_OPTIONS

  const isMultiSource = initialLines.length > 0

  const [billableType, setBillableType] = useState<BillableToKind>(
    (initial.billable_to_type as BillableToKind) ?? 'subsidiary',
  )
  const [companyId, setCompanyId] = useState(initial.company_id ?? '')
  const [deptId, setDeptId] = useState(initial.billable_to_department_id ?? '')
  const [freetextName, setFreetextName] = useState(initial.billable_to_freetext_name ?? '')
  const [freetextAddress, setFreetextAddress] = useState(initial.billable_to_freetext_address ?? '')
  const [freetextPhone, setFreetextPhone] = useState(initial.billable_to_freetext_phone ?? '')
  const [freetextEmail, setFreetextEmail] = useState(initial.billable_to_freetext_email ?? '')
  const [billingMode, setBillingMode] = useState<CreateInvoiceMode>(
    (initial.billing_mode as CreateInvoiceMode) ?? 'venture_attribution',
  )
  const [period, setPeriod] = useState((initial.period_month ?? '').slice(0, 7))
  const [invoiceDate, setInvoiceDate] = useState(initial.invoice_date ?? '')
  const [dueDate, setDueDate] = useState(initial.due_date ?? '')
  // Header description round-trips independently of the lines. For a legacy
  // single-source invoice (no line rows) the description WAS the summary, so
  // surface it here in the header field — not buried inside line 1.
  const [headerDescription, setHeaderDescription] = useState(initial.description ?? '')
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
          // Single-source: description lives in the header field above, so the
          // sole line just carries the amount (+ category). Description optional.
          {
            uid: crypto.randomUUID(),
            description: '',
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
    if (issued && !reason.trim()) return setError('Give a reason — it goes on the audit trail.')
    if (billableType === 'subsidiary' && !companyId) return setError('Pick a subsidiary')
    if (billableType === 'dept_pool' && !deptId) return setError('Pick a department')
    if ((billableType === 'director' || billableType === 'freetext') && !freetextName.trim()) {
      return setError(billableType === 'director' ? 'Enter director name' : 'Enter party name')
    }
    const validLines = lines.filter((l) => Number(l.amount) > 0)
    if (validLines.length === 0) {
      return setError('Add at least one line with an amount')
    }
    if (validLines.length >= 2 && validLines.some((l) => !l.description.trim())) {
      return setError('With 2+ lines, each line needs a description')
    }

    startTransition(async () => {
      try {
        const body = {
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
          freetextAddress: billableType === 'freetext' ? freetextAddress.trim() : undefined,
          freetextPhone: billableType === 'freetext' ? freetextPhone.trim() : undefined,
          freetextEmail: billableType === 'freetext' ? freetextEmail.trim() : undefined,
          lines: validLines.map((l) => ({
            description: l.description.trim(),
            amount: Number(l.amount),
            categoryCode: l.categoryCode.trim(),
          })),
        }
        if (issued) await updateIssuedInvoiceFull({ ...body, reason: reason.trim() })
        else await updateDraftInvoiceFull(body)
        setOpen(false)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed')
      }
    })
  }

  const modal = open ? (
    <div
      className="fixed inset-0 z-50 bg-scrim/45 backdrop-blur-sm flex items-center justify-center p-4"
      {...backdropDismiss(() => !isPending && setOpen(false))}
    >
      <div
        className="bg-paper border border-hairline rounded-panel shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between px-6 py-4 border-b border-hairline shrink-0">
          <div>
            <h2 className="font-serif text-2xl text-ink">{issued ? 'Edit issued invoice' : 'Edit draft invoice'}</h2>
            <p className="font-serif italic text-graphite text-xs mt-1">
              {issued ? (
                <>
                  {invoiceNo ?? id.slice(0, 8)} · the journal entry posted at issue is corrected in place, under the
                  same number; the reason goes on the audit trail.
                  {locked ? ' Money has been received against this invoice, so the amount, the payer and the period are fixed.' : ''}
                </>
              ) : (
                <>
                  {invoiceNo ?? id.slice(0, 8)} · drafts are fully editable — nothing posts
                  until approve &amp; issue. 2+ lines saves as a multi-line invoice.
                </>
              )}
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
                  disabled={isPending || locked}
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
                disabled={isPending || locked}
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
                disabled={isPending || locked}
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
                disabled={isPending || locked}
                maxLength={120}
                className={inputCls}
              />
            </Field>
          )}
          {billableType === 'freetext' ? (
            <>
              <Field label="Address (optional)" hint="Shows on the invoice under Bill to.">
                <textarea
                  value={freetextAddress}
                  onChange={(e) => setFreetextAddress(e.target.value)}
                  disabled={isPending}
                  rows={2}
                  maxLength={300}
                  placeholder="Street, city, postcode"
                  className={inputCls}
                />
              </Field>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Phone (optional)">
                  <input
                    type="text"
                    value={freetextPhone}
                    onChange={(e) => setFreetextPhone(e.target.value)}
                    disabled={isPending}
                    maxLength={40}
                    placeholder="e.g., 012-345 6789"
                    className={inputCls}
                  />
                </Field>
                <Field label="Email (optional)">
                  <input
                    type="email"
                    value={freetextEmail}
                    onChange={(e) => setFreetextEmail(e.target.value)}
                    disabled={isPending}
                    maxLength={120}
                    placeholder="name@example.com"
                    className={inputCls}
                  />
                </Field>
              </div>
            </>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Pool / billing mode" required>
              <select
                value={billingMode}
                onChange={(e) => setBillingMode(e.target.value as CreateInvoiceMode)}
                disabled={isPending}
                className={inputCls}
              >
                {poolOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Period" required>
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                disabled={isPending || locked}
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
                      disabled={isPending || locked || lines.length === 1}
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
                          disabled={isPending || locked}
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
              disabled={isPending || locked}
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

          {issued ? (
            <Field label="Reason for the change" required hint="Goes on the audit trail and on the journal entry.">
              <textarea
                aria-label="Reason for the change"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                disabled={isPending}
                placeholder="e.g. wrong month on the line; fee agreed at 2,500"
                className={`${inputCls} resize-y`}
              />
            </Field>
          ) : null}

          {error ? (
            <div className="bg-danger/10 border border-danger/30 text-danger rounded-md px-3 py-2 text-sm font-sans">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-hairline bg-surface shrink-0">
          <div className="font-serif italic text-muted text-xs">
            {lines.filter((l) => Number(l.amount) > 0).length} valid line(s) · Total RM {fmtRm(total)}
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
      {hideTrigger ? null : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-graphite hover:text-ink font-serif italic"
        >
          Edit
        </button>
      )}
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

