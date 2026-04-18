'use client'

import { useState, useTransition } from 'react'
import dayjs from 'dayjs'
import { generateMonthlyInvoices, type GenerateInvoicesResult } from '../actions'

interface Props {
  currentPeriod: string
  modes?: string[]       // e.g. ['marketing_project'] — null = all
  label?: string         // button label override
  description?: string   // confirmation description override
}

export default function GenerateInvoicesButton({
  currentPeriod,
  modes,
  label = 'Generate invoices',
  description,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<GenerateInvoicesResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleConfirm() {
    setError(null)
    setResult(null)

    const formData = new FormData()
    formData.append('period_month', currentPeriod)
    if (modes) formData.append('modes', modes.join(','))

    startTransition(async () => {
      try {
        const res = await generateMonthlyInvoices(formData)
        setResult(res)
        setConfirming(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  const periodLabel = dayjs(currentPeriod).format('MMMM YYYY')
  const modeLabel = modes ? modes.join(', ') : 'all modes'

  if (confirming) {
    return (
      <div className="confirm-slide-in bg-surface border border-hairline rounded-md p-5 max-w-md">
        <h3 className="font-serif text-lg text-ink mb-2">{label}</h3>
        <p className="font-serif italic text-graphite text-sm mb-4">
          {description ?? `Generate draft invoices for ${periodLabel} (${modeLabel}). Already-issued invoices will be preserved.`}
        </p>

        {error ? (
          <div className="bg-danger-bg border border-danger text-danger rounded-md p-2 mb-3 text-xs font-sans">
            {error}
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Generating…' : 'Yes, generate'}
          </button>
          <button
            type="button"
            onClick={() => { setConfirming(false); setError(null) }}
            className="text-sm text-graphite hover:text-ink font-sans"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {result ? (
        <div className="text-right text-xs">
          <div className="font-serif italic text-ledger">
            {result.generated} generated
            {result.skipped > 0 ? `, ${result.skipped} preserved` : ''}
          </div>
          {Object.entries(result.mode_counts).some(([, n]) => n > 0) ? (
            <div className="font-mono text-xs text-muted mt-1">
              {Object.entries(result.mode_counts)
                .filter(([, n]) => n > 0)
                .map(([mode, n]) => `${mode}: ${n}`)
                .join(' · ')}
            </div>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-xs text-accent hover:text-accent-hover font-serif italic"
      >
        {label}
      </button>
    </div>
  )
}
