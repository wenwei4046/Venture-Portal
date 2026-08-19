'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import {
  fetchConsolidatedPayrollPreview,
  generateConsolidatedPayrollInvoices,
  type ConsolidatedCompanyPreview,
} from '../actions'
import AccountPicker, { type AccountOption } from '@/components/AccountPicker'
import type { AccountType } from '@/lib/coa'

// Consolidated payroll invoice generator (2026-07-03). One draft invoice per
// subsidiary combining HR + Finance + Director Office, each line itemised into
// Salary / Allowance / EPF / SOCSO / EIS and routed to its own P&L segment.
// Amounts are authoritative from HR's staff billing allocation (read-only here);
// Finance confirms/changes the revenue category (default 5020) before generating.

interface Category {
  code: string
  label: string
  type: AccountType
  parent_code: string | null
}

interface Props {
  currentPeriod: string
  categories?: Category[]
}

const COMPONENTS: Array<[keyof ConsolidatedCompanyPreview['groups'][number]['components'], string]> = [
  ['salary', 'Salary'],
  ['allowance', 'Allowance'],
  ['epf', 'EPF'],
  ['socso', 'SOCSO'],
  ['eis', 'EIS'],
]

function fmt(n: number): string {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function groupTotal(components: ConsolidatedCompanyPreview['groups'][number]['components']): number {
  return (
    Math.round(
      (components.salary + components.allowance + components.epf + components.socso + components.eis) * 100,
    ) / 100
  )
}

export default function GenerateConsolidatedInvoicesButton({ currentPeriod, categories = [] }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState(dayjs(currentPeriod).format('YYYY-MM'))
  const [preview, setPreview] = useState<ConsolidatedCompanyPreview[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [categoryCode, setCategoryCode] = useState('5050')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

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

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setPreview(null)
    const periodIso = dayjs(period + '-01').format('YYYY-MM-DD')
    fetchConsolidatedPayrollPreview(periodIso)
      .then((rows) => {
        if (!cancelled) setPreview(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load allocation')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, period])

  const grandTotal = useMemo(
    () => (preview ? Math.round(preview.reduce((s, c) => s + c.total, 0) * 100) / 100 : 0),
    [preview],
  )

  function handleGenerate() {
    setError(null)
    if (!preview || preview.length === 0) return setError('Nothing to generate for this period')
    startTransition(async () => {
      try {
        const res = await generateConsolidatedPayrollInvoices(
          dayjs(period + '-01').format('YYYY-MM-DD'),
          categoryCode.trim() || null,
        )
        setOpen(false)
        router.refresh()
        // Surface a lightweight confirmation via the URL-less refresh; the
        // invoice list re-renders with the new drafts.
        void res
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Generate failed')
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
        title="Generate one consolidated draft invoice per subsidiary (HR + Finance + Director Office)"
      >
        Generate payroll invoices
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
          onClick={() => !isPending && setOpen(false)}
        >
          <div
            className="bg-paper border border-hairline rounded-md shadow-xl w-full max-w-3xl my-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between px-6 py-4 border-b border-hairline">
              <div>
                <h2 className="font-serif text-2xl text-ink">Consolidated payroll invoices</h2>
                <p className="font-serif italic text-graphite text-xs mt-1">
                  One draft per subsidiary combining HR + Finance + Director Office. Amounts come from
                  HR&apos;s staff billing allocation; each line posts to its own department P&amp;L.
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Period" required>
                  <input
                    type="month"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    disabled={isPending}
                    className={`${inputCls} font-mono`}
                  />
                </Field>
                <Field label="Revenue category" hint="Applied to every line. Default 5020 Salary Income.">
                  <AccountPicker
                    accounts={categoryOptions}
                    value={categoryCode}
                    onChange={setCategoryCode}
                    name="consolidated_category"
                    placeholder="Select category…"
                    disabled={isPending}
                  />
                </Field>
              </div>

              {loading && (
                <p className="font-serif italic text-muted text-sm">Loading allocation from HR…</p>
              )}

              {!loading && preview && preview.length === 0 && (
                <div className="border border-hairline rounded-md bg-surface p-6 text-center">
                  <p className="font-serif italic text-muted text-sm">
                    No staff billing allocation for this period. Nothing to bill.
                  </p>
                </div>
              )}

              {!loading && preview && preview.length > 0 && (
                <div className="space-y-4">
                  <div className="font-serif italic text-accent text-xs">
                    {preview.length} subsidiar{preview.length === 1 ? 'y' : 'ies'} · one invoice each ·
                    grand total RM {fmt(grandTotal)}
                  </div>
                  {preview.map((c) => (
                    <div key={c.companyId} className="border border-hairline rounded-md bg-surface p-4">
                      <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-hairline">
                        <div className="font-serif text-md text-ink">
                          {c.name} <span className="font-mono text-xs text-muted">· {c.shortCode}</span>
                        </div>
                        <div className="font-mono tabular text-sm text-ink">RM {fmt(c.total)}</div>
                      </div>
                      <div className="space-y-3">
                        {c.groups.map((g) => (
                          <div key={g.segment}>
                            <div className="text-[11px] font-sans font-medium uppercase tracking-wide text-accent mb-1">
                              {g.deptLabel}
                            </div>
                            <table className="w-full text-xs">
                              <tbody>
                                {COMPONENTS.filter(([k]) => g.components[k] > 0).map(([k, label]) => (
                                  <tr key={k}>
                                    <td className="py-0.5 text-graphite">{label}</td>
                                    <td className="py-0.5 text-right font-mono tabular text-ink">
                                      {fmt(g.components[k])}
                                    </td>
                                  </tr>
                                ))}
                                <tr className="border-t border-hairline">
                                  <td className="py-0.5 font-medium text-graphite">{g.deptLabel} subtotal</td>
                                  <td className="py-0.5 text-right font-mono tabular font-medium text-ink">
                                    {fmt(groupTotal(g.components))}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div className="bg-danger/10 border border-danger/30 text-danger rounded-md px-3 py-2 text-sm font-sans">
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-hairline bg-surface">
              <div className="font-serif italic text-muted text-xs">
                Generates DRAFT invoices — review + approve each before issuing.
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
                  onClick={handleGenerate}
                  disabled={isPending || loading || !preview || preview.length === 0}
                  className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50"
                >
                  {isPending ? 'Generating…' : 'Generate drafts'}
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
