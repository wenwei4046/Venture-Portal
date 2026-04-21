'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import {
  createManualInvoice,
  fetchDirectorCtcByCompany,
  type CreateInvoiceMode,
} from '../actions'

interface Company {
  id: string
  name: string
  short_code: string
}

interface Props {
  companies: Company[]
  currentPeriod: string
  prefillMode?: CreateInvoiceMode
  /** Amount the dept payroll tells us we need to bill this period. Shown as
   *  the target that the subsidiary allocations should add up to. Pass 0
   *  when there's no target yet (header button use-case). */
  targetAmount?: number
  /** Amount already invoiced for this mode in the period. Subtracted from
   *  target to compute the remaining gap the modal is filling. */
  alreadyInvoiced?: number
  /** compact mode renders a small link-style button for embedding in KPI cards */
  compact?: boolean
  /** label override for the button; defaults to "+ Create Invoice" */
  label?: string
}

// Each option labels the Department Pool the invoice credits on settlement.
const POOL_OPTIONS: Array<{ value: CreateInvoiceMode; label: string; hint: string }> = [
  { value: 'hr_attribution',              label: 'HR Department Pool',              hint: 'Credits HR Dept Pool on settlement' },
  { value: 'finance_attribution',         label: 'Finance Department Pool',         hint: 'Credits Finance Dept Pool on settlement' },
  { value: 'director_office_attribution', label: 'Director Office Department Pool', hint: 'Credits Director Office Dept Pool on settlement' },
  { value: 'director_attribution',        label: 'Director Department Pool',        hint: 'Credits Director Dept Pool on settlement' },
  { value: 'marketing_project',           label: 'Marketing Department Pool',       hint: 'Marketing project billing' },
]

interface Row {
  uid: string
  companyId: string
  amount: string
}

function newRow(): Row {
  return { uid: crypto.randomUUID(), companyId: '', amount: '' }
}

function fmt(n: number): string {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function CreateInvoiceButton({
  companies,
  currentPeriod,
  prefillMode = 'hr_attribution',
  targetAmount = 0,
  alreadyInvoiced = 0,
  compact = false,
  label,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [mode, setMode] = useState<CreateInvoiceMode>(prefillMode)
  const [period, setPeriod] = useState(dayjs(currentPeriod).format('YYYY-MM'))
  const [invoiceDate, setInvoiceDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [dueDate, setDueDate] = useState(dayjs().add(30, 'day').format('YYYY-MM-DD'))
  const [description, setDescription] = useState('')
  const [referenceNo, setReferenceNo] = useState('')
  const [rows, setRows] = useState<Row[]>([newRow()])
  const [autoFillNote, setAutoFillNote] = useState<string | null>(null)
  // Track the mode+period combo we last auto-filled so we don't clobber user edits on every re-render.
  const autoFilledKey = useRef<string | null>(null)

  const remaining = Math.round((targetAmount - alreadyInvoiced) * 100) / 100
  const hasTarget = targetAmount > 0.005

  const allocated = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [rows],
  )
  const gap = Math.round((remaining - allocated) * 100) / 100
  const onTarget = hasTarget && Math.abs(gap) < 0.01
  const overTarget = hasTarget && gap < -0.005

  function reset() {
    setMode(prefillMode)
    setPeriod(dayjs(currentPeriod).format('YYYY-MM'))
    setInvoiceDate(dayjs().format('YYYY-MM-DD'))
    setDueDate(dayjs().add(30, 'day').format('YYYY-MM-DD'))
    setDescription('')
    setReferenceNo('')
    setRows([newRow()])
    setError(null)
    setAutoFillNote(null)
    autoFilledKey.current = null
  }

  // Mig 206: auto-fill subsidiary rows from HR's director_ctc when the user
  // picks director_attribution. Runs on mode OR period change to that combo,
  // but only once per combo so manual edits afterwards stick.
  useEffect(() => {
    if (!open) return
    if (mode !== 'director_attribution') {
      setAutoFillNote(null)
      return
    }
    const key = `${mode}|${period}`
    if (autoFilledKey.current === key) return
    autoFilledKey.current = key

    const periodIso = dayjs(period + '-01').format('YYYY-MM-DD')
    setAutoFillNote('Loading director CTC from HR…')
    fetchDirectorCtcByCompany(periodIso)
      .then((ctcRows) => {
        if (ctcRows.length === 0) {
          setAutoFillNote(
            `No director CTC entered by HR for ${dayjs(period + '-01').format('MMM YYYY')}. Enter amounts manually.`,
          )
          return
        }
        setRows(
          ctcRows.map((r) => ({
            uid: crypto.randomUUID(),
            companyId: r.companyId,
            amount: r.totalCtc.toFixed(2),
          })),
        )
        setAutoFillNote(
          `Auto-filled ${ctcRows.length} subsidiary ${ctcRows.length === 1 ? 'row' : 'rows'} from HR's director CTC for ${dayjs(period + '-01').format('MMM YYYY')}. Edit amounts as needed.`,
        )
        if (!description.trim()) {
          setDescription(`Director salary CTC — ${dayjs(period + '-01').format('MMMM YYYY')}`)
        }
      })
      .catch((err: unknown) => {
        setAutoFillNote(`Auto-fill failed: ${err instanceof Error ? err.message : String(err)}`)
      })
  }, [open, mode, period, description])

  function updateRow(uid: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setRows((prev) => [...prev, newRow()])
  }

  function removeRow(uid: string) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.uid !== uid)))
  }

  /** Auto-fill remaining gap into the last empty row. Called by the "Fill remaining" link. */
  function fillRemaining() {
    const remainingToFill = Math.round((remaining - allocated) * 100) / 100
    if (remainingToFill <= 0) return
    setRows((prev) => {
      const copy = [...prev]
      // Find the first row with empty amount, or append a new row
      const idx = copy.findIndex((r) => !r.amount || Number(r.amount) === 0)
      if (idx >= 0) {
        copy[idx] = { ...copy[idx], amount: remainingToFill.toFixed(2) }
      } else {
        copy.push({ ...newRow(), amount: remainingToFill.toFixed(2) })
      }
      return copy
    })
  }

  function handleSubmit() {
    setError(null)
    if (!description.trim()) return setError('Description is required')

    const validRows = rows.filter((r) => r.companyId && Number(r.amount) > 0)
    if (validRows.length === 0) return setError('Add at least one subsidiary with an amount')

    // Reject duplicate subsidiary within this submit
    const seen = new Set<string>()
    for (const r of validRows) {
      if (seen.has(r.companyId)) {
        return setError('Same subsidiary listed twice — merge or remove one')
      }
      seen.add(r.companyId)
    }

    startTransition(async () => {
      const results: Array<{ company: string; error?: string }> = []
      for (const r of validRows) {
        const company = companies.find((c) => c.id === r.companyId)
        const label = company?.short_code ?? company?.name ?? r.companyId
        const fd = new FormData()
        fd.set('company_id', r.companyId)
        fd.set('billing_mode', mode)
        fd.set('period_month', dayjs(period + '-01').format('YYYY-MM-DD'))
        fd.set('invoice_date', invoiceDate)
        fd.set('due_date', dueDate)
        fd.set('amount', Number(r.amount).toFixed(2))
        fd.set('description', description.trim())
        fd.set('reference_no', referenceNo.trim())
        try {
          await createManualInvoice(fd)
          results.push({ company: label })
        } catch (err) {
          results.push({
            company: label,
            error: err instanceof Error ? err.message : 'Create failed',
          })
        }
      }

      const failures = results.filter((r) => r.error)
      if (failures.length === 0) {
        setOpen(false)
        reset()
        router.refresh()
      } else {
        setError(
          `Created ${results.length - failures.length}/${results.length}. Failed: ` +
            failures.map((f) => `${f.company} (${f.error})`).join('; '),
        )
        router.refresh()
      }
    })
  }

  const triggerCls = compact
    ? 'text-xs font-sans text-accent hover:text-accent-hover underline-offset-2 hover:underline transition-colors'
    : 'bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors'

  const currentPoolLabel =
    POOL_OPTIONS.find((o) => o.value === mode)?.label ?? 'Pool'

  return (
    <>
      <button onClick={() => setOpen(true)} className={triggerCls}>
        {label ?? '+ Create Invoice'}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !isPending && setOpen(false)}
        >
          <div
            className="bg-paper border border-hairline rounded-md shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between px-6 py-4 border-b border-hairline">
              <div>
                <h2 className="font-serif text-2xl text-ink">Create Invoice</h2>
                <p className="font-serif italic text-graphite text-xs mt-1">
                  Split one dept&apos;s cost across multiple subsidiaries — each row becomes one draft invoice.
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
              {/* Pool + Period */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Credit to pool" required>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as CreateInvoiceMode)}
                    disabled={isPending}
                    className={inputCls}
                  >
                    {POOL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <div className="font-serif italic text-muted text-xs mt-1">
                    {POOL_OPTIONS.find((o) => o.value === mode)?.hint}
                  </div>
                </Field>

                <Field label="Period" required hint="Month the invoice belongs to">
                  <input
                    type="month"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    disabled={isPending}
                    className={inputCls + ' font-mono'}
                  />
                </Field>
              </div>

              {/* Target / Allocated tracker */}
              {hasTarget && (
                <div className="bg-surface border border-hairline rounded-md p-4">
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider font-sans text-muted">
                        {currentPoolLabel} target
                      </div>
                      <div className="font-mono tabular text-base text-ink mt-1">RM {fmt(remaining)}</div>
                      {alreadyInvoiced > 0.005 && (
                        <div className="font-serif italic text-muted text-xs mt-0.5">
                          RM {fmt(targetAmount)} total · RM {fmt(alreadyInvoiced)} already invoiced
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider font-sans text-muted">
                        Allocated
                      </div>
                      <div className="font-mono tabular text-base text-ink mt-1">RM {fmt(allocated)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider font-sans text-muted">
                        {onTarget ? 'On target' : overTarget ? 'Over' : 'Remaining'}
                      </div>
                      <div
                        className={
                          'font-mono tabular text-base mt-1 ' +
                          (onTarget ? 'text-ledger' : overTarget ? 'text-danger' : 'text-ink')
                        }
                      >
                        {onTarget ? '✓' : `RM ${fmt(Math.abs(gap))}`}
                      </div>
                      {!onTarget && !overTarget && gap > 0.005 && (
                        <button
                          onClick={fillRemaining}
                          disabled={isPending}
                          className="text-xs font-sans text-accent hover:text-accent-hover underline-offset-2 hover:underline mt-0.5"
                          type="button"
                        >
                          Fill remaining
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Subsidiary rows */}
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-xs font-sans font-medium text-graphite">
                    Subsidiaries <span className="text-danger">*</span>
                  </div>
                  <span className="font-serif italic text-muted text-xs">
                    {rows.length} {rows.length === 1 ? 'row' : 'rows'}
                  </span>
                </div>
                {autoFillNote ? (
                  <div className="font-serif italic text-graphite text-xs mb-2 px-3 py-2 bg-accent/5 border border-accent/20 rounded-md">
                    {autoFillNote}
                  </div>
                ) : null}
                <div className="border border-hairline rounded-md overflow-hidden bg-surface">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans bg-paper">
                        <th className="text-left py-2 px-3 font-medium">Subsidiary</th>
                        <th className="text-right py-2 px-3 font-medium w-40">Amount (RM)</th>
                        <th className="w-10 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.uid} className="border-b border-hairline last:border-0">
                          <td className="py-2 px-3">
                            <select
                              value={r.companyId}
                              onChange={(e) => updateRow(r.uid, { companyId: e.target.value })}
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
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={r.amount}
                              onChange={(e) =>
                                updateRow(r.uid, {
                                  amount: e.target.value.replace(/[^\d.]/g, ''),
                                })
                              }
                              placeholder="0.00"
                              disabled={isPending}
                              className={inputCls + ' font-mono tabular text-right'}
                            />
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              onClick={() => removeRow(r.uid)}
                              disabled={isPending || rows.length === 1}
                              className="text-muted hover:text-danger disabled:opacity-30 disabled:cursor-not-allowed text-lg leading-none"
                              aria-label="Remove row"
                              type="button"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={addRow}
                  disabled={isPending}
                  className="mt-2 text-xs font-sans text-accent hover:text-accent-hover underline-offset-2 hover:underline"
                  type="button"
                >
                  + Add subsidiary
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
                    className={inputCls + ' font-mono'}
                  />
                </Field>
                <Field label="Due date" hint="Default: 30 days after invoice date">
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    disabled={isPending}
                    className={inputCls + ' font-mono'}
                  />
                </Field>
              </div>

              {/* Description */}
              <Field label="Description" required hint="Applied to all invoices in this batch">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="What is this invoice for?"
                  disabled={isPending}
                  className={inputCls + ' resize-y'}
                />
              </Field>

              {/* Reference no */}
              <Field label="Reference no" hint="PO number, contract ref — optional, applied to all">
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
                {rows.filter((r) => r.companyId && Number(r.amount) > 0).length} invoice
                {rows.filter((r) => r.companyId && Number(r.amount) > 0).length === 1 ? '' : 's'} will be created
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
                  {isPending ? 'Creating…' : 'Create Invoices'}
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
