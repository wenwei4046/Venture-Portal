'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createCreditNote, type CreateInvoiceMode } from '../actions'
import AccountPicker, { type AccountOption } from '@/components/AccountPicker'
import type { AccountType } from '@/lib/coa'

interface Props {
  invoiceId: string
  invoiceNo: string | null
  invoiceTotal: number
  /** Label shown for the party being credited. Already resolved by the parent
   *  list (subsidiary name OR free-text/dept name from Item 5 polymorphism). */
  payeeLabel: string
  /** Phase 11 / post-unified-COA: chart_of_accounts rows for GL routing per
   *  CN row. parent_code + type let AccountPicker hide headers. */
  categories?: Array<{
    code: string
    label: string
    type: AccountType
    parent_code: string | null
  }>
  /** Dynamically provisioned dept modes (dept-registry) appended to the list. */
  extraModes?: Array<{ value: string; label: string }>
}

const POOL_OPTIONS: Array<{ value: CreateInvoiceMode; label: string }> = [
  { value: 'venture_attribution',         label: 'Venture Pool' },
  { value: 'marketing_project',           label: 'Marketing Department Pool' },
  { value: 'hr_attribution',              label: 'HR Department Pool' },
  { value: 'finance_attribution',         label: 'Finance Department Pool' },
  { value: 'director_office_attribution', label: 'Director Office Department Pool' },
  { value: 'director_attribution',        label: 'Director Department Pool' },
]

interface CnRow {
  uid: string
  mode: CreateInvoiceMode | ''
  categoryCode: string
  amount: string
}

function newRow(): CnRow {
  return { uid: crypto.randomUUID(), mode: '', categoryCode: '', amount: '' }
}

function fmt(n: number): string {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Phase 11: credit note becomes multi-pool — each row = one credit_note record
// with its own pool / category / amount. Sum cannot exceed parent invoice total.
export default function CreateCreditNoteButton({
  invoiceId,
  invoiceNo,
  invoiceTotal,
  payeeLabel,
  categories = [],
  extraModes = [],
}: Props) {
  const router = useRouter()
  const poolOptions = [...POOL_OPTIONS, ...(extraModes as unknown as typeof POOL_OPTIONS)]
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [rows, setRows] = useState<CnRow[]>([newRow()])

  const validRows = useMemo(
    () => rows.filter((r) => r.mode && r.categoryCode && Number(r.amount) > 0),
    [rows],
  )

  // mig 246: categories → AccountPicker shape; picker auto-hides headers.
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
  const allocated = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [rows],
  )
  const remaining = Math.round((invoiceTotal - allocated) * 100) / 100

  function reset() {
    setRows([newRow()])
    setReason('')
    setError(null)
  }

  function updateRow(uid: string, patch: Partial<CnRow>) {
    setRows((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)))
  }
  function addRow() {
    setRows((prev) => [...prev, newRow()])
  }
  function removeRow(uid: string) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.uid !== uid)))
  }

  function handleSubmit() {
    setError(null)
    if (!reason.trim()) return setError('Reason is required')
    if (validRows.length === 0) return setError('Add at least one row with pool / category / amount')

    if (allocated > invoiceTotal + 0.005) {
      return setError(`Sum of credit rows (RM ${fmt(allocated)}) exceeds invoice total (RM ${fmt(invoiceTotal)})`)
    }
    const seen = new Set<string>()
    for (const r of validRows) {
      const key = `${r.mode}|${r.categoryCode}`
      if (seen.has(key)) {
        return setError('Duplicate pool + category combination — merge or change one')
      }
      seen.add(key)
    }

    startTransition(async () => {
      const failures: Array<{ label: string; error: string }> = []
      let created = 0
      for (const r of validRows) {
        const fd = new FormData()
        fd.set('invoice_id', invoiceId)
        fd.set('amount', Number(r.amount).toFixed(2))
        fd.set('reason', reason.trim())
        fd.set('billing_mode', r.mode as string)
        fd.set('category_code', r.categoryCode)
        try {
          await createCreditNote(fd)
          created += 1
        } catch (err) {
          const lbl = poolOptions.find((o) => o.value === r.mode)?.label ?? String(r.mode)
          failures.push({ label: lbl, error: err instanceof Error ? err.message : 'Create failed' })
        }
      }
      if (failures.length === 0) {
        setOpen(false)
        reset()
        router.refresh()
      } else {
        setError(
          `Created ${created}/${validRows.length}. Failed: ` +
            failures.map((f) => `${f.label} (${f.error})`).join('; '),
        )
        router.refresh()
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
            className="bg-paper border border-hairline rounded-md shadow-xl w-full max-w-3xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between px-6 py-4 border-b border-hairline">
              <div>
                <h2 className="font-serif text-2xl text-ink">Credit note</h2>
                <p className="font-serif italic text-graphite text-xs mt-1">
                  Reduces what {payeeLabel} owes against this invoice. Each row creates its own credit note with its own pool / category.
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
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider font-sans text-muted">Invoice</div>
                    <div className="font-mono tabular text-ink mt-1">{invoiceNo ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider font-sans text-muted">Bill to</div>
                    <div className="font-serif text-ink mt-1">{payeeLabel}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider font-sans text-muted">Invoice total</div>
                    <div className="font-mono tabular text-ink mt-1">RM {fmt(invoiceTotal)}</div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-hairline grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider font-sans text-muted">Allocated</div>
                    <div className="font-mono tabular text-ink mt-1">RM {fmt(allocated)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider font-sans text-muted">Remaining</div>
                    <div
                      className={`font-mono tabular mt-1 ${remaining < -0.005 ? 'text-danger' : 'text-ink'}`}
                    >
                      RM {fmt(Math.abs(remaining))}
                      {remaining < -0.005 ? ' over' : ''}
                    </div>
                  </div>
                </div>
              </div>

              <label className="block">
                <div className="text-xs font-sans font-medium text-graphite mb-1">
                  Reason <span className="text-danger">*</span>
                </div>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  disabled={isPending}
                  placeholder="Why is this credit being raised?"
                  className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border resize-y"
                />
              </label>

              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-xs font-sans font-medium text-graphite">
                    Credit split <span className="text-danger">*</span>
                  </div>
                  <span className="font-serif italic text-muted text-xs">
                    {rows.length} {rows.length === 1 ? 'row' : 'rows'}
                  </span>
                </div>
                <div className="border border-hairline rounded-md overflow-hidden bg-surface">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans bg-paper">
                        <th className="text-left py-2 px-3 font-medium">Pool to debit</th>
                        <th className="text-left py-2 px-3 font-medium">Category</th>
                        <th className="text-right py-2 px-3 font-medium w-40">Amount (RM)</th>
                        <th className="w-10 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.uid} className="border-b border-hairline last:border-0">
                          <td className="py-2 px-3">
                            <select
                              value={r.mode}
                              onChange={(e) => updateRow(r.uid, { mode: e.target.value as CreateInvoiceMode })}
                              disabled={isPending}
                              className={inputCls}
                            >
                              <option value="">Select pool…</option>
                              {poolOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-3">
                            <AccountPicker
                              accounts={categoryOptions}
                              value={r.categoryCode}
                              onChange={(code) => updateRow(r.uid, { categoryCode: code })}
                              name={`cn_row_category_${r.uid}_display`}
                              placeholder="Select category…"
                              disabled={isPending}
                            />
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={r.amount}
                              onChange={(e) => updateRow(r.uid, { amount: e.target.value.replace(/[^\d.]/g, '') })}
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
                  + Add credit row
                </button>
              </div>

              {error ? (
                <div className="bg-danger/10 border border-danger/30 text-danger rounded-md px-3 py-2 text-sm font-sans">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-hairline bg-surface">
              <div className="font-serif italic text-muted text-xs">
                {validRows.length} credit note{validRows.length === 1 ? '' : 's'} will be created
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
                  {isPending ? 'Creating…' : 'Create Credit Notes'}
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
