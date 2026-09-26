'use client'

import { useState, useTransition } from 'react'
import { submitToFinance } from '../actions'
import { usePayrollDraft } from './PayrollDraftContext'

interface Props {
  period: string
  totalAmount: number
}

export default function SubmitToFinanceButton({ period, totalAmount }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const { dirtyCount } = usePayrollDraft()

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      try {
        await submitToFinance(period)
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

  // Unsaved inline edits would be silently excluded from the submitted totals
  // — force a Save (page-level button or per-row) before allowing submit.
  if (dirtyCount > 0) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          disabled
          className="bg-accent text-sm px-4 py-2 rounded-control opacity-40 cursor-not-allowed"
          title="Save your edits first"
        >
          Submit to Finance
        </button>
        <span className="chip alert">
          <span className="dot" />
          {dirtyCount} unsaved row{dirtyCount > 1 ? 's' : ''} — save first
        </span>
      </div>
    )
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-3 bg-surface border border-accent rounded-lg px-4 py-2.5 max-w-xl">
          <span className="text-sm">
            Submit payroll · Total CTC <span className="font-mono tabular-nums font-medium">RM {totalAmount.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</span> to Finance?
            <span className="block text-xs mt-1">This is the amount Finance funds (gross + employer statutory). Figures become visible to Finance immediately — money moves later.</span>
          </span>
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-accent hover:bg-accent-hover text-sm px-3 py-1.5 rounded-control transition-colors disabled:opacity-50 shrink-0"
          >
            {isPending ? 'Submitting...' : 'Confirm'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={isPending}
            className="text-xs hover:underline underline-offset-2 shrink-0"
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
