'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { backdropDismiss } from '@/components/modal-dismiss'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import {
  fetchOwnShareInvoicePreview,
  generateOwnShareInvoice,
  type OwnShareInvoicePreview,
} from '../actions'
import AccountPicker, { type AccountOption } from '@/components/AccountPicker'
import type { AccountType } from '@/lib/coa'

// Own-share → Venture (Office) invoice generator (2026-07). ONE inter-billing
// invoice billed to the internal Venture Office pseudo-dept, combining each
// staff-attribution dept's HV own-share (the payroll NOT billed to any
// subsidiary). Each dept recovers its own-share; Venture (Office) bears it.
// Amounts are authoritative from get_staff_own_share_allocation (read-only);
// Finance confirms the category.
//
// 2026-09-29: which departments bill back is no longer fixed in the program.
// The dialog lists EVERY department with a residual and ticks the ones
// Settings → Departments says to bill back; untick or tick one and it applies
// to this run only, so a month where HR's leftover should go to Venture Office
// after all does not need a settings change.

interface Category {
  code: string
  label: string
  type: AccountType
  parent_code: string | null
}

interface Props {
  currentPeriod: string
  categories?: Category[]
  /** Arrive open, from a page-head menu (2026-10-10, the handoff's
   *  "From payroll ▾" / "+ Create Invoice ▾"). */
  autoOpen?: boolean
  /** No trigger button of its own — the menu item is the trigger. */
  hideTrigger?: boolean
}

type Components = OwnShareInvoicePreview['groups'][number]['components']

const COMPONENTS: Array<[keyof Components, string]> = [
  ['salary', 'Salary'],
  ['allowance', 'Allowance'],
  ['epf', 'EPF'],
  ['socso', 'SOCSO'],
  ['eis', 'EIS'],
]

function fmt(n: number): string {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function groupTotal(c: Components): number {
  return Math.round((c.salary + c.allowance + c.epf + c.socso + c.eis) * 100) / 100
}

// One instance per month, keyed on the month the server rendered (2026-09-11:
// a ?period= navigation keeps a modal mounted, seeded with the old month).
export default function GenerateOwnShareInvoiceButton(props: Props) {
  return <GenerateOwnShareInvoiceButtonBody key={props.currentPeriod} {...props} />
}

function GenerateOwnShareInvoiceButtonBody({ currentPeriod, categories = [], autoOpen = false, hideTrigger = false }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(autoOpen)
  const [period, setPeriod] = useState(dayjs(currentPeriod).format('YYYY-MM'))
  const [preview, setPreview] = useState<OwnShareInvoicePreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [categoryCode, setCategoryCode] = useState('5050')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  // Seeded from the registry each time the preview loads.
  const [ticked, setTicked] = useState<Set<string>>(new Set())

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
    fetchOwnShareInvoicePreview(dayjs(period + '-01').format('YYYY-MM-DD'))
      .then((p) => {
        if (cancelled) return
        setPreview(p)
        setTicked(new Set(p.billBack))
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load own-share')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, period])

  const hasResidual = !!preview && preview.groups.length > 0
  const tickedGroups = preview ? preview.groups.filter((g) => ticked.has(g.segment)) : []
  const hasData = tickedGroups.length > 0
  const tickedTotal =
    Math.round(tickedGroups.reduce((sum, g) => sum + groupTotal(g.components), 0) * 100) / 100

  function toggle(segment: string) {
    setTicked((prev) => {
      const next = new Set(prev)
      if (next.has(segment)) next.delete(segment)
      else next.add(segment)
      return next
    })
  }

  function handleGenerate() {
    setError(null)
    if (!hasData) return setError('Tick at least one department to bill back')
    startTransition(async () => {
      try {
        await generateOwnShareInvoice(
          dayjs(period + '-01').format('YYYY-MM-DD'),
          categoryCode.trim() || null,
          [...ticked],
        )
        setOpen(false)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Generate failed')
      }
    })
  }

  return (
    <>
      {hideTrigger ? null : (
      <button
        onClick={() => setOpen(true)}
        className="bg-surface hover:bg-surface-2 border border-hairline text-graphite hover:text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
        title="Bill HV's own-share of payroll to Venture (Office) — one internal inter-billing invoice"
      >
        Own-share → Venture (Office)
      </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 bg-scrim/45 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
          {...backdropDismiss(() => !isPending && setOpen(false))}
        >
          <div
            className="bg-paper border border-hairline rounded-panel shadow-xl w-full max-w-2xl my-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between px-6 py-4 border-b border-hairline">
              <div>
                <h2 className="font-serif text-2xl text-ink">Own-share → Venture (Office)</h2>
                <p className="font-serif italic text-graphite text-xs mt-1">
                  One internal invoice to Venture (Office) for HV&apos;s own-share of payroll. Each
                  department recovers its share; Venture (Office) bears it. No cash moves.
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
                    name="own_share_category"
                    placeholder="Select category…"
                    disabled={isPending}
                  />
                </Field>
              </div>

              {loading && <p className="font-serif italic text-muted text-sm">Loading own-share…</p>}

              {!loading && preview && !hasResidual && (
                <div className="border border-hairline rounded-md bg-surface p-6 text-center">
                  <p className="font-serif italic text-muted text-sm">
                    No own-share for this period — every department&apos;s payroll was fully billed to
                    subsidiaries. Nothing to bill Venture (Office).
                  </p>
                </div>
              )}

              {!loading && hasResidual && preview && (
                <div className="border border-hairline rounded-md bg-surface p-4">
                  <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-hairline">
                    <div className="font-serif text-md text-ink">
                      Bill to <span className="font-sans">Venture (Office)</span>
                    </div>
                    <div className="font-mono tabular text-sm text-ink">RM {fmt(tickedTotal)}</div>
                  </div>
                  <p className="font-serif italic text-muted text-[11px] mb-3">
                    Unticked departments keep their own share in their own pool. The ticks come
                    from Settings → Departments; changing one here applies to this run only.
                  </p>
                  <div className="space-y-3">
                    {preview.groups.map((g) => (
                      <div key={g.segment} className={ticked.has(g.segment) ? '' : 'opacity-45'}>
                        <label className="flex items-center gap-2 mb-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ticked.has(g.segment)}
                            onChange={() => toggle(g.segment)}
                            disabled={isPending}
                            className="accent-accent"
                          />
                          <span className="text-[11px] font-sans font-medium uppercase tracking-wide text-accent">
                            {g.deptLabel}
                          </span>
                        </label>
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
              )}

              {error && (
                <div className="bg-danger/10 border border-danger/30 text-danger rounded-md px-3 py-2 text-sm font-sans">
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-hairline bg-surface">
              <div className="font-serif italic text-muted text-xs">
                Generates a DRAFT — review + approve before issuing. Settle via netting.
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
                  disabled={isPending || loading || !hasData}
                  className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50"
                >
                  {isPending ? 'Generating…' : 'Generate draft'}
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
