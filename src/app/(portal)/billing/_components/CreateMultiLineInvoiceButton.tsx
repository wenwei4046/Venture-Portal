'use client'

import { useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import {
  createMultiLineInvoice,
  type BillableToKind,
  type CreateInvoiceMode,
} from '../actions'
import AccountPicker, { type AccountOption } from '@/components/AccountPicker'
import type { AccountType } from '@/lib/coa'

// Multi-line invoice creator (mig 275). One bill-to + one billing_mode, N line
// items. Each line has its own description + amount + category. Use when you
// need to bill many typed items in a single document (vs. the multi-pool
// template flow which creates N independent invoices).

interface Company {
  id: string
  name: string
  short_code: string
}

interface Department {
  id: string
  name: string
}

interface Category {
  code: string
  label: string
  type: AccountType
  parent_code: string | null
}

interface Props {
  companies: Company[]
  currentPeriod: string
  departments?: Department[]
  categories?: Category[]
}

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

interface LineRow {
  uid: string
  description: string
  amount: string
  categoryCode: string
}

function newLine(): LineRow {
  return { uid: crypto.randomUUID(), description: '', amount: '', categoryCode: '' }
}

function fmt(n: number): string {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function CreateMultiLineInvoiceButton({
  companies,
  currentPeriod,
  departments = [],
  categories = [],
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [billableType, setBillableType] = useState<BillableToKind>('subsidiary')
  const [companyId, setCompanyId] = useState('')
  const [deptId, setDeptId] = useState('')
  const [freetextName, setFreetextName] = useState('')
  const [billingMode, setBillingMode] = useState<CreateInvoiceMode>('marketing_project')

  const [period, setPeriod] = useState(dayjs(currentPeriod).format('YYYY-MM'))
  const [invoiceDate, setInvoiceDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [dueDate, setDueDate] = useState(dayjs().add(30, 'day').format('YYYY-MM-DD'))
  const [headerDescription, setHeaderDescription] = useState('')
  const [referenceNo, setReferenceNo] = useState('')
  const [lines, setLines] = useState<LineRow[]>([newLine()])

  const modalContentRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!open) return
    const parent = modalContentRef.current?.parentElement
    if (parent) parent.scrollTop = 0
  }, [open])

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

  function reset() {
    setBillableType('subsidiary')
    setCompanyId('')
    setDeptId('')
    setFreetextName('')
    setBillingMode('marketing_project')
    setPeriod(dayjs(currentPeriod).format('YYYY-MM'))
    setInvoiceDate(dayjs().format('YYYY-MM-DD'))
    setDueDate(dayjs().add(30, 'day').format('YYYY-MM-DD'))
    setHeaderDescription('')
    setReferenceNo('')
    setLines([newLine()])
    setError(null)
  }

  function updateLine(uid: string, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((l) => (l.uid === uid ? { ...l, ...patch } : l)))
  }
  function addLine() {
    setLines((prev) => [...prev, newLine()])
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
    const validLines = lines.filter((l) => Number(l.amount) > 0)
    if (validLines.length === 0) {
      return setError('Add at least one line with an amount')
    }
    if (validLines.length >= 2 && validLines.some((l) => !l.description.trim())) {
      return setError('With 2+ lines, each line needs a description')
    }

    startTransition(async () => {
      try {
        await createMultiLineInvoice({
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
        reset()
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Create failed')
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-surface hover:bg-surface-2 border border-hairline text-graphite hover:text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
        title="One bill with multiple line items, each with its own description + category"
      >
        + Multi-line Invoice
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => !isPending && setOpen(false)}
        >
          <div
            ref={modalContentRef}
            className="bg-paper border border-hairline rounded-md shadow-xl w-full max-w-3xl my-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between px-6 py-4 border-b border-hairline">
              <div>
                <h2 className="font-serif text-2xl text-ink">Multi-line Invoice</h2>
                <p className="font-serif italic text-graphite text-xs mt-1">
                  One bill with N line items. Each line gets its own description + amount + category.
                  Approve & issue posts per-line Cr to each category.
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
              {/* Bill-to type */}
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

              {/* Bill-to detail */}
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
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.short_code}
                      </option>
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
                    placeholder={billableType === 'director' ? 'e.g., Tan Wei Liang' : 'e.g., Maybank, ABC Holdings'}
                    className={inputCls}
                  />
                </Field>
              )}

              {/* Billing mode + Period */}
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

              {/* Line items */}
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-xs font-sans font-medium text-graphite">
                    Line items <span className="text-danger">*</span>
                  </div>
                  <span className="font-serif italic text-muted text-xs">
                    {lines.length} {lines.length === 1 ? 'line' : 'lines'} · Total RM {fmt(total)}
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
                              name={`line_cat_${l.uid}`}
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

              {/* Invoice date + Due date */}
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

              <Field label="Header description (optional)" hint="Shows as the invoice summary; per-line descriptions are the detail.">
                <textarea
                  value={headerDescription}
                  onChange={(e) => setHeaderDescription(e.target.value)}
                  rows={2}
                  placeholder="Optional summary, e.g. 'Marketing services May 2026'"
                  disabled={isPending}
                  className={`${inputCls} resize-y`}
                />
              </Field>

              <Field label="Reference no" hint="PO number, contract ref — optional">
                <input
                  type="text"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder="(optional)"
                  disabled={isPending}
                  className={inputCls}
                />
              </Field>

              {error && (
                <div className="bg-danger/10 border border-danger/30 text-danger rounded-md px-3 py-2 text-sm font-sans">
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-hairline bg-surface">
              <div className="font-serif italic text-muted text-xs">
                {lines.filter((l) => Number(l.amount) > 0).length} valid line(s) · Total RM {fmt(total)}
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
                  {isPending ? 'Creating…' : 'Create invoice'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
