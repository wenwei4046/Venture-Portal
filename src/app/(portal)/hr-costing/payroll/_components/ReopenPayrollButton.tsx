'use client'

import { useState, useTransition } from 'react'
import { reopenPayroll } from '../actions'

interface Props {
  period: string
}

/**
 * HR self-service reopen — replacement for the removed Principal reject path.
 * Pulls a submitted run back to draft so statutory / amounts can be edited,
 * as long as no payment request is in flight.
 */
export default function ReopenPayrollButton({ period }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      try {
        await reopenPayroll(period)
        // Action redirects — unreachable on success
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Reopen failed'
        if (msg.includes('NEXT_REDIRECT')) return
        setError(msg)
        setConfirming(false)
      }
    })
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <span className="font-serif italic text-graphite text-xs">
            Pull figures back for edits? Finance loses sight of them until you resubmit.
          </span>
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="text-xs font-serif italic text-danger hover:underline disabled:opacity-50"
          >
            {isPending ? 'Reopening…' : 'Confirm reopen'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={isPending}
            className="text-xs font-sans text-muted hover:text-ink"
          >
            Cancel
          </button>
        </div>
        {error && <span className="text-xs font-serif italic text-danger">{error}</span>}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => setConfirming(true)}
        className="text-xs font-serif italic text-graphite hover:text-accent transition-colors"
      >
        Reopen for edits
      </button>
      {error && <span className="text-xs font-serif italic text-danger">{error}</span>}
    </div>
  )
}
