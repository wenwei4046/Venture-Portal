'use client'

import { useState, useTransition } from 'react'
import { updateRentSplits, updateUtilitySplits } from '../actions'

interface Row {
  id?: string
  company_id: string | null
  is_hv_share: boolean
  split_pct: number
  company_label: string
}

interface Props {
  kind: 'rent' | 'utility'
  companies: Array<{ id: string; name: string; short_code: string }>
  initial: Array<{ id?: string; company_id: string | null; is_hv_share: boolean; split_pct: number }>
}

export default function SplitEditor({ kind, companies, initial }: Props) {
  // Build the rows: one per company + one HV row. Merge initial values.
  const initialByCompany = new Map(
    initial
      .filter((r) => !r.is_hv_share && r.company_id)
      .map((r) => [r.company_id as string, r.split_pct])
  )
  const initialHvPct = initial.find((r) => r.is_hv_share)?.split_pct ?? 0

  const [rows, setRows] = useState<Row[]>(() => [
    ...companies.map((c) => ({
      company_id: c.id,
      is_hv_share: false,
      split_pct: initialByCompany.get(c.id) ?? 0,
      company_label: `${c.name} (${c.short_code})`,
    })),
    {
      company_id: null,
      is_hv_share: true,
      split_pct: initialHvPct,
      company_label: 'HV (self, non-billable)',
    },
  ])

  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const total = rows.reduce((acc, r) => acc + (Number.isFinite(r.split_pct) ? r.split_pct : 0), 0)
  const totalPercent = Math.round(total * 10000) / 100 // 2dp
  const isValid = Math.abs(total - 1) < 0.0001

  function updatePct(idx: number, value: string) {
    const parsed = parseFloat(value)
    const pct = isNaN(parsed) ? 0 : parsed / 100
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, split_pct: pct } : r)))
    setSaved(false)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    if (!isValid) {
      setError(`Total must be 100%. Current total: ${totalPercent.toFixed(2)}%`)
      return
    }

    const payload = rows.map((r) => ({
      company_id: r.is_hv_share ? null : r.company_id,
      is_hv_share: r.is_hv_share,
      split_pct: r.split_pct,
    }))

    const formData = new FormData()
    formData.append('splits', JSON.stringify(payload))

    startTransition(async () => {
      try {
        if (kind === 'rent') {
          await updateRentSplits(formData)
        } else {
          await updateUtilitySplits(formData)
        }
        setSaved(true)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs uppercase tracking-wide text-muted font-sans">
              <th className="text-left py-2 pr-4 font-medium">Target</th>
              <th className="text-right py-2 font-medium">Split %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={row.company_id ?? 'hv'}
                className="border-b border-hairline last:border-0"
              >
                <td className="py-2 pr-4">
                  <span className={row.is_hv_share ? 'font-serif italic text-muted text-sm' : 'font-serif text-md text-ink'}>
                    {row.company_label}
                  </span>
                </td>
                <td className="py-2 text-right">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={(row.split_pct * 100).toString()}
                    onChange={(e) => updatePct(idx, e.target.value)}
                    className="w-24 px-3 py-1.5 bg-paper border border-hairline rounded-md text-sm font-mono tabular text-right text-ink focus:outline-none focus:border-accent-border"
                    disabled={isPending}
                  />
                  <span className="text-muted font-mono text-xs ml-1">%</span>
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink/40">
              <td className="py-3 pr-4 font-serif italic text-md text-ink">Total</td>
              <td className="py-3 text-right font-mono tabular text-md">
                <span className={isValid ? 'text-ledger' : 'text-danger'}>
                  {totalPercent.toFixed(2)}%
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-2 text-xs font-sans">
          {error}
        </div>
      ) : null}

      {saved ? (
        <div className="font-serif italic text-ledger text-sm">
          Saved ·{' '}
          {kind === 'rent'
            ? 'Rent split template updated.'
            : 'Utility split template updated.'}
        </div>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={!isValid || isPending}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Saving…' : `Save ${kind} splits`}
        </button>
      </div>
    </form>
  )
}
