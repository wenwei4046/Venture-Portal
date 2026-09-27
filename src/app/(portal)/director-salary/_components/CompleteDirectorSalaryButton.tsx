'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { completeDirectorSalary } from '../actions'

interface Props {
  period: string
  totalGross: number
  disabled?: boolean
  disabledHint?: string
}

/**
 * Complete (unified Payroll, 2026-09-27 — was "Submit to Finance"): the
 * directors' pay is checked and locked, and they appear on HR › Payroll as
 * Completed, with the date. The money goes to Finance with that page's Submit
 * to Finance, in a batch like everybody else's.
 */
export default function CompleteDirectorSalaryButton({
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
        await completeDirectorSalary(period)
        setConfirming(false)
        router.refresh()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Complete failed'
        if (msg.includes('NEXT_REDIRECT')) return
        setError(msg)
        setConfirming(false)
      }
    })
  }

  // Transparency rule: a Complete whose total comes from another source must
  // explain itself when that source is missing — disabled + hint, no silent 0.
  if (disabled) {
    return (
      <div className="flex flex-col items-end gap-2">
        <button disabled title={disabledHint} className="bg-accent/40 text-sm px-4 py-2 rounded-control cursor-not-allowed">
          Complete
        </button>
        {disabledHint && <span className="text-xs text-right">{disabledHint}</span>}
      </div>
    )
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-3 bg-surface border border-accent-border rounded-card px-4 py-2.5">
          <span className="text-sm max-w-md">
            Complete director salary (gross RM {totalGross.toLocaleString('en-MY', { minimumFractionDigits: 2 })})?
            <span className="block mt-1 text-xs">
              The directors lock and appear on HR › Payroll as Completed; the per-subsidiary split becomes
              visible to Finance for billing. The money goes to Finance when HR › Payroll submits the next batch.
            </span>
          </span>
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="shrink-0 bg-accent hover:bg-accent-hover text-sm px-3 py-1.5 rounded-control transition-colors disabled:opacity-50"
          >
            {isPending ? 'Completing…' : 'Confirm'}
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
        Complete
      </button>
      {error && <span className="text-sm text-danger">{error}</span>}
    </div>
  )
}
