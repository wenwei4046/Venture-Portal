'use client'

import { useMemo, useState, useTransition } from 'react'
import { formatMoney } from '@/lib/utils'
import { generateFixedSplitInvoices, type FixedSplitResult } from '../actions'

interface Company {
  id: string
  name: string
  short_code: string
}

interface Headcount {
  company_id: string | null
  headcount: number
}

interface Props {
  currentPeriod: string
  canGenerate?: boolean
  companies: Company[]
  savedHeadcounts: Headcount[]
}

export default function FixedSplitPanel({
  currentPeriod,
  canGenerate,
  companies,
  savedHeadcounts,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<FixedSplitResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const initialHc = useMemo(() => {
    const byCompany = new Map<string, number>()
    let hv = 0
    for (const h of savedHeadcounts) {
      if (h.company_id === null) hv = h.headcount
      else byCompany.set(h.company_id, h.headcount)
    }
    return { byCompany, hv }
  }, [savedHeadcounts])

  const [subHc, setSubHc] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const c of companies) init[c.id] = String(initialHc.byCompany.get(c.id) ?? '')
    return init
  })
  const [hvHc, setHvHc] = useState<string>(String(initialHc.hv || ''))

  const totalHc = useMemo(() => {
    const subSum = Object.values(subHc).reduce((s, v) => s + (parseInt(v, 10) || 0), 0)
    return subSum + (parseInt(hvHc, 10) || 0)
  }, [subHc, hvHc])

  function handleSubmit(formData: FormData) {
    setError(null)
    setResult(null)

    const headcounts: Headcount[] = companies
      .map((c) => ({ company_id: c.id, headcount: parseInt(subHc[c.id] ?? '0', 10) || 0 }))
      .filter((h) => h.headcount > 0)

    const hv = parseInt(hvHc, 10) || 0
    if (hv > 0) headcounts.push({ company_id: null, headcount: hv })

    if (headcounts.length === 0) {
      setError('Enter at least one headcount > 0')
      return
    }

    formData.set('headcounts', JSON.stringify(headcounts))

    startTransition(async () => {
      try {
        const res = await generateFixedSplitInvoices(formData)
        setResult(res)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <section className="border-t border-hairline pt-8 mt-10">
      <h2 className="font-serif text-xl text-ink mb-4">Fixed Split (Rent + Utility)</h2>
      <p className="font-serif italic text-graphite text-sm mb-4">
        HV pays office rent + utility upfront, then bills each subsidiary based on <em>monthly headcount</em>.
        HV&apos;s own headcount share stays in Venture Pool (non-billable).
      </p>

      {canGenerate ? (
        <form action={handleSubmit} className="border border-hairline rounded-md bg-surface p-5 space-y-5">
          <input type="hidden" name="period_month" value={currentPeriod} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-serif italic text-sm text-graphite mb-1">
                Total rent this month (RM)
              </label>
              <input
                type="number"
                name="rent_total"
                min="0"
                step="0.01"
                defaultValue=""
                placeholder="e.g. 25000.00"
                className="w-full border border-hairline rounded-md px-3 py-2 font-mono text-sm text-ink bg-paper focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block font-serif italic text-sm text-graphite mb-1">
                Total utility this month (RM)
              </label>
              <input
                type="number"
                name="utility_total"
                min="0"
                step="0.01"
                defaultValue=""
                placeholder="e.g. 8000.00"
                className="w-full border border-hairline rounded-md px-3 py-2 font-mono text-sm text-ink bg-paper focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-2">
              <label className="block font-serif italic text-sm text-graphite">
                Headcount this month
              </label>
              <span className="font-mono text-xs text-muted">
                total {totalHc}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {companies.map((c) => (
                <div key={c.id}>
                  <label className="block font-mono text-xs text-muted mb-0.5">
                    {c.name}{' '}
                    <span className="text-muted/60">({c.short_code})</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={subHc[c.id] ?? ''}
                    onChange={(e) => setSubHc((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    placeholder="0"
                    className="w-full border border-hairline rounded-md px-2 py-1.5 font-mono text-sm text-ink bg-paper focus:outline-none focus:border-accent"
                  />
                </div>
              ))}
              <div>
                <label className="block font-mono text-xs text-accent mb-0.5">HV (own staff)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={hvHc}
                  onChange={(e) => setHvHc(e.target.value)}
                  placeholder="0"
                  className="w-full border border-accent-border rounded-md px-2 py-1.5 font-mono text-sm text-ink bg-paper focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-danger-bg border border-danger text-danger rounded-md p-2 text-xs font-sans">
              {error}
            </div>
          )}

          {result && (
            <div className="bg-surface-2 rounded-md p-3 text-xs">
              <div className="font-serif italic text-ledger mb-1">
                {result.generated} invoice{result.generated === 1 ? '' : 's'} generated · total HC {result.total_headcount}
              </div>
              <div className="font-mono text-muted space-y-0.5">
                {result.rent_invoices > 0 && (
                  <div>Rent: {result.rent_invoices} invoices · HV share: {formatMoney(result.hv_rent_share)}</div>
                )}
                {result.utility_invoices > 0 && (
                  <div>Utility: {result.utility_invoices} invoices · HV share: {formatMoney(result.hv_utility_share)}</div>
                )}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50"
          >
            {isPending ? 'Generating…' : 'Generate fixed split invoices'}
          </button>
        </form>
      ) : (
        <div className="border border-hairline rounded-md bg-surface p-6 text-center">
          <p className="font-serif italic text-muted text-sm">
            Finance enters rent, utility totals, and per-company headcount here to generate split invoices.
          </p>
        </div>
      )}
    </section>
  )
}
