'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { approvePayrollRun, rejectPayrollRun } from '../actions'

interface Props {
  runId: string
  totalAmount: number
}

export default function ApproveRejectButtons({ runId, totalAmount }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<'idle' | 'confirmApprove' | 'confirmReject'>('idle')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleApprove() {
    setError(null)
    startTransition(async () => {
      try {
        await approvePayrollRun(runId)
        router.refresh()
        setMode('idle')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Approve failed'
        if (msg.includes('NEXT_REDIRECT')) return
        setError(msg)
      }
    })
  }

  function handleReject() {
    setError(null)
    startTransition(async () => {
      try {
        await rejectPayrollRun(runId, reason)
        // action redirects to /approvals
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Reject failed'
        if (msg.includes('NEXT_REDIRECT')) return
        setError(msg)
      }
    })
  }

  if (mode === 'confirmApprove') {
    return (
      <div className="flex flex-col items-end gap-2 bg-surface border border-accent-border rounded-md p-4 max-w-md">
        <p className="font-serif text-sm text-ink">
          Approve the April payroll costing for{' '}
          <strong>RM {totalAmount.toLocaleString('en-MY', { minimumFractionDigits: 2 })}</strong>?
        </p>
        <p className="font-serif italic text-graphite text-xs mb-1">
          This confirms the numbers are correct so Finance can invoice the subsidiaries.
          <strong> No money moves yet</strong> — payment vouchers are generated in a later step when HR
          requests payroll payment.
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleApprove}
            disabled={isPending}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md disabled:opacity-50"
          >
            {isPending ? 'Approving...' : 'Approve costing'}
          </button>
          <button
            onClick={() => setMode('idle')}
            disabled={isPending}
            className="text-xs font-sans text-muted hover:text-ink px-2"
          >
            Cancel
          </button>
        </div>
        {error && <span className="text-sm font-serif italic text-danger">{error}</span>}
      </div>
    )
  }

  if (mode === 'confirmReject') {
    return (
      <div className="flex flex-col items-stretch gap-3 bg-surface border border-hairline rounded-md p-4 max-w-md">
        <label className="font-serif text-sm text-ink">
          Rejection reason <span className="text-xs text-muted italic">(required)</span>
        </label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          placeholder="e.g. Commission for MK not yet computed — please re-submit after Spec 3."
          className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={handleReject}
            disabled={isPending || reason.trim().length === 0}
            className="bg-danger hover:bg-danger-hover text-white font-serif italic text-sm px-4 py-2 rounded-md disabled:opacity-50"
          >
            {isPending ? 'Rejecting...' : 'Reject'}
          </button>
          <button
            onClick={() => setMode('idle')}
            disabled={isPending}
            className="text-xs font-sans text-muted hover:text-ink px-2"
          >
            Cancel
          </button>
        </div>
        {error && <span className="text-sm font-serif italic text-danger">{error}</span>}
      </div>
    )
  }

  return (
    <div className="flex gap-3">
      <button
        onClick={() => setMode('confirmApprove')}
        className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md"
      >
        Approve →
      </button>
      <button
        onClick={() => setMode('confirmReject')}
        className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md"
      >
        Reject
      </button>
    </div>
  )
}
