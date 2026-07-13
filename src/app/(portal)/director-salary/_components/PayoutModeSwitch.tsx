'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { calculateDirectorSalary } from '../actions'
import type { PayoutMode } from '@/lib/salary'

interface Props {
  period: string
  currentMode: PayoutMode
  /** Recalculation only allowed while all payouts are draft. */
  locked: boolean
}

/**
 * "Fully Paid" toggle (user 2026-06-04 R5; redefined 2026-07-13). Recalculates
 * the period in the other mode:
 *  - fully_paid: staff-style payout — NO saving, no 75/25. 100% of gross is
 *    paid as ONE standard payroll (Basic+KPI with statutory, Allowance
 *    without). Nothing accumulates into the Invoice Pool.
 *  - split: classic 5% saving, then 75% payroll / 25% invoice.
 */
export default function PayoutModeSwitch({ period, currentMode, locked }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const targetMode: PayoutMode = currentMode === 'split' ? 'fully_paid' : 'split'

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      try {
        await calculateDirectorSalary(period, targetMode)
        setConfirming(false)
        router.refresh()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Recalculation failed'
        if (msg.includes('NEXT_REDIRECT')) return
        setError(msg)
        setConfirming(false)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-graphite">
          Mode:{' '}
          <em className={`not-italic ${currentMode === 'fully_paid' ? 'text-accent' : 'text-ledger'}`}>
            {currentMode === 'fully_paid' ? 'FULLY PAID (100% one payroll · no saving)' : 'SPLIT 75 / 25'}
          </em>
        </span>
        {!locked && !confirming && (
          <button
            onClick={() => setConfirming(true)}
            className={
              targetMode === 'fully_paid'
                ? 'bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-3 py-1.5 rounded-md transition-colors'
                : 'bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-3 py-1.5 rounded-md transition-colors'
            }
          >
            {targetMode === 'fully_paid' ? 'Fully Paid' : 'Back to 75 / 25'}
          </button>
        )}
      </div>
      {confirming && (
        <div className="flex items-center gap-2 bg-surface border border-accent-border rounded-md px-3 py-2 mt-1">
          <span className="font-serif italic text-graphite text-xs max-w-sm">
            {targetMode === 'fully_paid'
              ? 'Recalculate this month as Fully Paid? No saving, no 75/25 — 100% of gross pays out as one standard payroll like a staff payslip (B+K with statutory, Allowance without). Nothing goes to the Invoice Pool.'
              : 'Recalculate this month with the classic 5% saving + 75% payroll / 25% invoice split?'}
          </span>
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-xs px-3 py-1.5 rounded-md disabled:opacity-50 shrink-0"
          >
            {isPending ? 'Recalculating…' : 'Confirm'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={isPending}
            className="text-xs font-sans text-muted hover:text-ink shrink-0"
          >
            Cancel
          </button>
        </div>
      )}
      {locked && (
        <span className="font-serif italic text-xs text-muted">
          Submitted — reopen on the Submission tab to change mode
        </span>
      )}
      {error && <span className="font-serif italic text-xs text-danger">{error}</span>}
    </div>
  )
}
