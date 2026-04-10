'use client'

import { useState, useTransition } from 'react'
import { calculateDirectorSalary, type CalculateResult } from '../actions'
import { formatMoney } from '@/lib/utils'

export default function CalculateButton({ period }: { period: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CalculateResult | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  function handleConfirm() {
    setError(null)
    setResult(null)
    startTransition(async () => {
      try {
        const res = await calculateDirectorSalary(period)
        setResult(res)
        setShowConfirm(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  if (result) {
    return (
      <div className="border border-hairline rounded-md bg-surface p-5">
        <p className="font-serif italic text-ledger text-lg mb-1">
          Calculation complete.
        </p>
        <p className="font-sans text-sm text-graphite">
          {result.saved} director payouts saved.
          {result.advanceTotal > 0 && (
            <> Advance total: <span className="font-mono tabular text-alert">{formatMoney(result.advanceTotal)}</span> (pending approval).</>
          )}
        </p>
      </div>
    )
  }

  if (!showConfirm) {
    return (
      <button
        onClick={() => setShowConfirm(true)}
        className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
      >
        Calculate
      </button>
    )
  }

  return (
    <div className="w-[26rem] border border-hairline rounded-md bg-surface p-5">
      <p className="font-serif text-lg text-ink mb-1">Confirm Calculation</p>
      <p className="font-serif italic text-graphite text-sm mb-4">
        This will compute salary payouts for all active directors. Existing draft
        payouts for this period will be replaced.
      </p>

      {error && (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-2 mb-3 text-xs font-sans">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleConfirm}
          disabled={isPending}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Calculating...' : 'Confirm'}
        </button>
        <button
          onClick={() => { setShowConfirm(false); setError(null) }}
          className="text-sm text-graphite hover:text-ink font-sans"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
