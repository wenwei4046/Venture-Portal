'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { CloseReadiness } from '@/lib/payroll-lifecycle'
import { closePayrollMonth, reopenPayrollMonth } from '../actions'

interface Props {
  period: string
  monthName: string
  readiness: CloseReadiness
  closed: { at: string; by: string | null } | null
  /** The Principal alone may open a closed month again. */
  canReopen: boolean
}

/**
 * Total Close (unified Payroll, 2026-09-27): once everybody has gone to
 * Finance, the month is closed for good — no edit, Complete, Resubmit or
 * batch. Only the Principal can reopen it, with a reason (user's choice).
 */
export default function TotalCloseButton({ period, monthName, readiness, closed, canReopen }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<'idle' | 'close' | 'reopen'>('idle')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  function run(action: () => Promise<void>) {
    setError(null)
    startTransition(async () => {
      try {
        await action()
        setMode('idle')
        setReason('')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That did not save')
      }
    })
  }

  if (closed) {
    if (!canReopen) return null
    if (mode === 'reopen') {
      return (
        <div className="bg-surface border border-hairline rounded-lg px-4 py-3 max-w-md" role="dialog" aria-label="Reopen month">
          <p className="text-sm font-bold">Reopen {monthName}?</p>
          <p className="text-xs mt-1">HR can change it again until somebody closes it. The reopening is logged with your reason.</p>
          <label className="block text-xs mt-2">
            Why
            <input
              type="text"
              value={reason}
              maxLength={500}
              onChange={e => { setReason(e.target.value); setError(null) }}
              className="mt-1 w-full border border-hairline rounded-control px-2 py-1 text-sm text-ink bg-paper"
              placeholder="e.g. August commission arrears"
              disabled={isPending}
            />
          </label>
          <div className="flex items-center justify-end gap-3 mt-3">
            <button onClick={() => setMode('idle')} disabled={isPending} className="text-xs hover:underline underline-offset-2">Cancel</button>
            <button
              onClick={() => run(() => reopenPayrollMonth(period, reason))}
              disabled={isPending || !reason.trim()}
              className="border border-danger/50 text-danger text-sm px-3 py-1.5 rounded-control disabled:opacity-40"
            >
              {isPending ? 'Reopening…' : 'Reopen month'}
            </button>
          </div>
          {error && <p className="text-xs text-danger mt-2" role="alert">{error}</p>}
        </div>
      )
    }
    return (
      <button onClick={() => setMode('reopen')} className="text-sm px-3 py-2 rounded-control border border-hairline bg-surface hover:bg-surface-2">
        Reopen month
      </button>
    )
  }

  if (mode === 'close') {
    return (
      <div className="bg-surface border border-hairline rounded-lg px-4 py-3 max-w-md" role="dialog" aria-label="Total Close">
        <p className="text-sm font-bold">Close {monthName} for good?</p>
        <p className="text-xs mt-1">
          Nothing in it can change afterwards — no edits, Complete, Resubmit or new batches. Payments already with
          Finance still go ahead. Only the Principal can reopen it.
        </p>
        <div className="flex items-center justify-end gap-3 mt-3">
          <button onClick={() => setMode('idle')} disabled={isPending} className="text-xs hover:underline underline-offset-2">Cancel</button>
          <button
            onClick={() => run(() => closePayrollMonth(period))}
            disabled={isPending}
            className="bg-ink text-paper text-sm px-3 py-1.5 rounded-control disabled:opacity-40"
          >
            {isPending ? 'Closing…' : 'Total Close'}
          </button>
        </div>
        {error && <p className="text-xs text-danger mt-2" role="alert">{error}</p>}
      </div>
    )
  }

  const blocked = !readiness.ready
  const title = blocked
    ? `${readiness.reason ?? 'Not ready'}${readiness.waiting.length ? ` — ${readiness.waiting.slice(0, 8).join(', ')}${readiness.waiting.length > 8 ? '…' : ''}` : ''}`
    : 'Everybody has gone to Finance — close the month for good'
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => { setError(null); setMode('close') }}
        disabled={blocked}
        title={title}
        className="text-sm px-4 py-2 rounded-control border border-hairline bg-surface hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Total Close
      </button>
      {error && <span className="text-sm text-danger" role="alert">{error}</span>}
    </div>
  )
}
