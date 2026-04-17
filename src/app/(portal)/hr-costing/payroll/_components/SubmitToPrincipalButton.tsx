'use client'

import { useState, useTransition } from 'react'
import { submitToPrincipal } from '../actions'

interface Props {
  period: string
  totalAmount: number
}

export default function SubmitToPrincipalButton({ period, totalAmount }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      try {
        await submitToPrincipal(period)
        // Action redirects — unreachable on success
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Submit failed'
        // Next.js throws NEXT_REDIRECT on success — ignore that
        if (msg.includes('NEXT_REDIRECT')) return
        setError(msg)
        setConfirming(false)
      }
    })
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-3 bg-surface border border-accent-border rounded-md px-4 py-2">
          <span className="font-serif italic text-graphite text-sm">
            Submit April payroll (RM {totalAmount.toLocaleString('en-MY', { minimumFractionDigits: 2 })}) for Principal approval? <em>Confirms the numbers only — money moves later.</em>
          </span>
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-3 py-1.5 rounded-md disabled:opacity-50"
          >
            {isPending ? 'Submitting...' : 'Confirm'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={isPending}
            className="text-xs font-sans text-muted hover:text-ink"
          >
            Cancel
          </button>
        </div>
        {error && <span className="text-sm font-serif italic text-danger">{error}</span>}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={() => setConfirming(true)}
        className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
      >
        Submit for Approval
      </button>
      {error && <span className="text-sm font-serif italic text-danger">{error}</span>}
    </div>
  )
}
