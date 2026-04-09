'use client'

import { useState, useTransition } from 'react'
import { submitEscalation } from '../actions'

export default function EscalateButton({ overdueId }: { overdueId: string }) {
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleConfirm() {
    setError(null)
    const formData = new FormData()
    formData.append('overdue_id', overdueId)

    startTransition(async () => {
      try {
        await submitEscalation(formData)
      } catch (err) {
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) throw err
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm text-accent hover:text-accent-hover font-serif italic"
      >
        Escalate →
      </button>
    )
  }

  return (
    <div className="inline-flex items-center gap-2 text-xs">
      {error ? (
        <span className="text-danger font-serif italic">{error}</span>
      ) : (
        <>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-danger hover:opacity-90 text-white font-serif italic text-xs px-3 py-1.5 rounded transition-opacity disabled:opacity-50"
          >
            {isPending ? '…' : 'Confirm escalation'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-muted hover:text-ink font-sans"
          >
            Cancel
          </button>
        </>
      )}
    </div>
  )
}
