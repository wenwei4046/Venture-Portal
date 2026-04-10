'use client'

import { useState, useTransition } from 'react'
import { confirmPayouts } from '../actions'

export default function ConfirmPayoutsButton({ period, draftCount }: { period: string; draftCount: number }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ confirmed: number } | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  if (draftCount === 0) return null

  if (result) {
    return (
      <span className="text-sm font-serif italic text-ledger">
        {result.confirmed} payouts confirmed.
      </span>
    )
  }

  if (!showConfirm) {
    return (
      <button
        onClick={() => setShowConfirm(true)}
        className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
      >
        Confirm All ({draftCount})
      </button>
    )
  }

  return (
    <div className="inline-flex items-center gap-3">
      <span className="font-serif italic text-sm text-graphite">Confirm {draftCount} draft payouts?</span>
      <button
        onClick={() => {
          setError(null)
          startTransition(async () => {
            try {
              const res = await confirmPayouts(period)
              setResult(res)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Unknown error')
            }
          })
        }}
        disabled={isPending}
        className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? 'Confirming...' : 'Yes, Confirm'}
      </button>
      <button
        onClick={() => setShowConfirm(false)}
        className="text-sm text-graphite hover:text-ink font-sans"
      >
        Cancel
      </button>
      {error && <span className="text-sm font-serif italic text-danger">{error}</span>}
    </div>
  )
}
