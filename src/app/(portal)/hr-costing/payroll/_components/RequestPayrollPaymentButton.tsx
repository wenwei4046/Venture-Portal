'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { requestPayrollPayment, cancelPayrollPaymentRequest } from '../actions'

export type RequestState =
  | { kind: 'none' }
  | { kind: 'submitted'; requestId: string; requestedAt: string }
  | { kind: 'pv_generated'; pvId: string; requestId: string; paidAmount: number }
  | { kind: 'completed'; pvId: string; completedAt: string | null }
  | { kind: 'cancelled' }

interface Props {
  runId: string
  totalAmount: number
  state: RequestState
}

function fmt(amount: number): string {
  return amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })
}

export default function RequestPayrollPaymentButton({
  runId,
  totalAmount,
  state,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<'idle' | 'confirmRequest' | 'confirmCancel'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  function handleRequest() {
    setError(null)
    startTransition(async () => {
      try {
        await requestPayrollPayment(runId)
        router.refresh()
        setMode('idle')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Request failed'
        setError(msg)
      }
    })
  }

  function handleCancel(requestId: string) {
    setError(null)
    startTransition(async () => {
      try {
        await cancelPayrollPaymentRequest(requestId, cancelReason)
        router.refresh()
        setMode('idle')
        setCancelReason('')
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Cancel failed'
        setError(msg)
      }
    })
  }

  // ─── Cancelled terminal — allow re-request ─────────────────────────────────
  if (state.kind === 'cancelled' || state.kind === 'none') {
    if (mode === 'confirmRequest') {
      return (
        <div className="flex flex-col items-end gap-2 bg-surface border border-accent-border rounded-md p-4 max-w-md">
          <p className="font-serif text-sm text-ink">
            Request payment of <strong>RM {fmt(totalAmount)}</strong> from Finance?
          </p>
          <p className="font-serif italic text-graphite text-xs mb-1">
            Finance will generate a Payment Voucher, then Principal approves it.
            The money moves from the HV bank account into the HR Pool.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleRequest}
              disabled={isPending}
              className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md disabled:opacity-50"
            >
              {isPending ? 'Requesting…' : 'Confirm request'}
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
      <div className="flex flex-col items-end gap-2">
        <button
          onClick={() => setMode('confirmRequest')}
          className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
        >
          Request for Payroll Payment
        </button>
        {error && <span className="text-sm font-serif italic text-danger">{error}</span>}
      </div>
    )
  }

  // ─── Submitted — waiting for Finance, HR can cancel ────────────────────────
  if (state.kind === 'submitted') {
    if (mode === 'confirmCancel') {
      return (
        <div className="flex flex-col items-stretch gap-2 bg-surface border border-hairline rounded-md p-4 max-w-md">
          <label className="font-serif text-sm text-ink">
            Cancel request · <span className="text-xs text-muted italic">(reason required)</span>
          </label>
          <textarea
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
            rows={3}
            placeholder="e.g. Wrong period selected — will re-submit after correction"
            className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-sans text-ink focus:outline-none focus:border-accent-border"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => handleCancel(state.requestId)}
              disabled={isPending || cancelReason.trim().length === 0}
              className="bg-danger hover:bg-danger-hover text-white font-serif italic text-sm px-4 py-2 rounded-md disabled:opacity-50"
            >
              {isPending ? 'Cancelling…' : 'Cancel request'}
            </button>
            <button
              onClick={() => {
                setMode('idle')
                setCancelReason('')
              }}
              disabled={isPending}
              className="text-xs font-sans text-muted hover:text-ink px-2"
            >
              Keep request
            </button>
          </div>
          {error && <span className="text-sm font-serif italic text-danger">{error}</span>}
        </div>
      )
    }
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="bg-surface border border-accent-border rounded-md px-4 py-2">
          <em className="font-serif italic text-accent text-sm">Submitted to Finance</em>
          <span className="font-mono text-xs text-muted ml-2">
            RM {fmt(totalAmount)}
          </span>
        </div>
        <button
          onClick={() => setMode('confirmCancel')}
          className="text-xs font-sans text-muted hover:text-danger transition-colors"
        >
          Cancel request
        </button>
      </div>
    )
  }

  // ─── PV generated — waiting for Principal PV approval ──────────────────────
  if (state.kind === 'pv_generated') {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="bg-surface border border-accent-border rounded-md px-4 py-2">
          <em className="font-serif italic text-accent text-sm">
            PV generated · awaiting Principal
          </em>
          <span className="font-mono text-xs text-muted ml-2">
            {state.paidAmount > 0
              ? `已付 ${fmt(state.paidAmount)} / 总额 ${fmt(totalAmount)}`
              : `RM ${fmt(totalAmount)}`}
          </span>
        </div>
      </div>
    )
  }

  // ─── Completed — HR Pool funded ───────────────────────────────────────────
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="bg-surface border border-ledger/40 rounded-md px-4 py-2">
        <em className="font-serif italic text-ledger text-sm">
          ✓ HR Pool funded
        </em>
        <span className="font-mono text-xs text-muted ml-2">
          RM {fmt(totalAmount)}
        </span>
      </div>
    </div>
  )
}
