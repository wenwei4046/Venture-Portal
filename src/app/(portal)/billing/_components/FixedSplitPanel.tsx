'use client'

import { useState, useTransition } from 'react'
import { formatMoney } from '@/lib/utils'
import { generateFixedSplitInvoices, type FixedSplitResult } from '../actions'

interface Props {
  currentPeriod: string
  canGenerate?: boolean
}

export default function FixedSplitPanel({ currentPeriod, canGenerate }: Props) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<FixedSplitResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(formData: FormData) {
    setError(null)
    setResult(null)
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
    <section className="border-t border-hairline pt-8">
      <h2 className="font-serif text-xl text-ink mb-4">Fixed Split</h2>
      <p className="font-serif italic text-graphite text-sm mb-4">
        Rent and utility monthly totals split across subsidiaries by percentage.
        HV&apos;s own share is <em>non-billable</em> and is deducted from the
        operating fund. Split percentages are configured in{' '}
        <em>Settings</em>.
      </p>

      {canGenerate ? (
        <form action={handleSubmit} className="border border-hairline rounded-md bg-surface p-5">
          <input type="hidden" name="period_month" value={currentPeriod} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
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
                className="w-full border border-hairline rounded-md px-3 py-2 font-mono text-sm text-ink bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
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
                className="w-full border border-hairline rounded-md px-3 py-2 font-mono text-sm text-ink bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
              />
            </div>
          </div>

          {error && (
            <div className="bg-danger-bg border border-danger text-danger rounded-md p-2 mb-3 text-xs font-sans">
              {error}
            </div>
          )}

          {result && (
            <div className="bg-surface-2 rounded-md p-3 mb-3 text-xs">
              <div className="font-serif italic text-ledger mb-1">
                {result.generated} invoice{result.generated === 1 ? '' : 's'} generated
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
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Generating...' : 'Generate fixed split invoices'}
          </button>
        </form>
      ) : (
        <div className="border border-hairline rounded-md bg-surface p-6 text-center">
          <p className="font-serif italic text-muted text-sm">
            Finance enters monthly rent and utility totals here to generate
            split invoices. Split percentages are configured by Principal in Settings.
          </p>
        </div>
      )}
    </section>
  )
}
