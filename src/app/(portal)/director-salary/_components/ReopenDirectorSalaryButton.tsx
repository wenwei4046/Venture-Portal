'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { reopenDirectorSalary } from '../actions'

interface Props {
  period: string
}

/**
 * Take a Complete back before the directors go to Finance (unified Payroll,
 * 2026-09-27): editable again, billing snapshot withdrawn. Anybody already
 * submitted is resubmitted from HR › Payroll instead.
 */
export default function ReopenDirectorSalaryButton({ period }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      try {
        await reopenDirectorSalary(period)
        setConfirming(false)
        router.refresh()
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
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-xs">
            Unlock the completed directors for edits? They leave HR › Payroll&apos;s next batch until you Complete again.
          </span>
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="text-xs font-medium text-danger bg-danger-bg border border-danger/40 hover:bg-danger/15 px-3 py-1.5 rounded-control transition-colors disabled:opacity-50"
          >
            {isPending ? 'Reopening…' : 'Confirm reopen'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={isPending}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-xs px-3 py-1.5 rounded-control transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={() => setConfirming(true)}
        className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-4 py-2 rounded-control transition-colors"
      >
        Reopen
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  )
}
