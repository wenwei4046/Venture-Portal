'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { submitDirectorSalaryToFinance } from '../actions'

interface Props {
  period: string
  totalGross: number
  disabled?: boolean
  disabledHint?: string
}

export default function SubmitDirectorSalaryButton({
  period,
  totalGross,
  disabled,
  disabledHint,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      try {
        await submitDirectorSalaryToFinance(period)
        setConfirming(false)
        router.refresh()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Submit failed'
        if (msg.includes('NEXT_REDIRECT')) return
        setError(msg)
        setConfirming(false)
      }
    })
  }

  // Transparency rule: a submit whose total comes from another source must
  // explain itself when that source is missing — disabled + hint, no silent 0.
  if (disabled) {
    return (
      <div className="flex flex-col items-end gap-2">
        <button
          disabled
          title={disabledHint}
          className="bg-accent/40 text-sm px-4 py-2 rounded-control cursor-not-allowed"
        >
          Submit to Finance
        </button>
        {disabledHint && (
          <span className="text-xs text-right">{disabledHint}</span>
        )}
      </div>
    )
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-3 bg-surface border border-accent-border rounded-card px-4 py-2.5">
          <span className="text-sm max-w-md">
            Submit director salary (RM {totalGross.toLocaleString('en-MY', { minimumFractionDigits: 2 })}) to Finance?
            <span className="block mt-1 text-xs">
              Totals + per-subsidiary contributions become visible to Finance immediately, and a funding request (gross + employer statutory) is filed in Finance&apos;s payroll queue.
            </span>
          </span>
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="shrink-0 bg-accent hover:bg-accent-hover text-sm px-3 py-1.5 rounded-control transition-colors disabled:opacity-50"
          >
            {isPending ? 'Submitting...' : 'Confirm'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={isPending}
            className="shrink-0 bg-surface hover:bg-surface-2 border border-hairline text-ink text-xs px-3 py-1.5 rounded-control transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={() => setConfirming(true)}
        className="bg-accent hover:bg-accent-hover text-sm px-4 py-2 rounded-control transition-colors"
      >
        Submit to Finance
      </button>
      {error && <span className="text-sm text-danger">{error}</span>}
    </div>
  )
}
