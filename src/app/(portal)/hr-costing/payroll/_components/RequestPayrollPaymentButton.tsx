'use client'

import { useState, useTransition, type ReactNode } from 'react'
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
        <div className="flex flex-col items-end gap-2 bg-surface border border-accent rounded-lg p-4 max-w-md">
          <p className="text-sm">
            Request payment of <strong className="font-bold">RM {fmt(totalAmount)}</strong> from Finance?
          </p>
          <p className="text-xs mb-1">
            Finance will generate a Payment Voucher, then Principal approves it.
            The money moves from the HV bank account into the HR Pool.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRequest}
              disabled={isPending}
              className="bg-accent hover:bg-accent-hover text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-50"
            >
              {isPending ? 'Requesting…' : 'Confirm request'}
            </button>
            <button
              onClick={() => setMode('idle')}
              disabled={isPending}
              className="text-xs hover:underline underline-offset-2 px-2"
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
          onClick={() => setMode('confirmRequest')}
          className="bg-accent hover:bg-accent-hover text-sm px-4 py-2 rounded-control transition-colors"
        >
          Request for Payroll Payment
        </button>
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    )
  }

  // ─── Submitted — waiting for Finance, HR can cancel ────────────────────────
  if (state.kind === 'submitted') {
    if (mode === 'confirmCancel') {
      return (
        <div className="flex flex-col items-stretch gap-2 bg-surface border border-hairline rounded-lg p-4 max-w-md">
          <label className="text-sm font-medium">
            Cancel request · <span className="text-xs font-normal">(reason required)</span>
          </label>
          <textarea
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
            rows={3}
            placeholder="e.g. Wrong period selected — will re-submit after correction"
            className="px-3 py-2 bg-surface border border-hairline rounded-control text-sm text-ink focus:outline-none focus:border-accent"
          />
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => handleCancel(state.requestId)}
              disabled={isPending || cancelReason.trim().length === 0}
              className="bg-danger hover:bg-danger/90 text-white text-sm px-4 py-2 rounded-control transition-colors disabled:opacity-50"
            >
              {isPending ? 'Cancelling…' : 'Cancel request'}
            </button>
            <button
              onClick={() => {
                setMode('idle')
                setCancelReason('')
              }}
              disabled={isPending}
              className="text-xs hover:underline underline-offset-2 px-2"
            >
              Keep request
            </button>
          </div>
          {error && <span className="text-sm text-danger">{error}</span>}
        </div>
      )
    }
    return (
      <div className="flex flex-col items-end gap-1">
        <StatusBox tone="alert" word="Submitted to Finance">
          RM {fmt(totalAmount)}
        </StatusBox>
        <button
          onClick={() => setMode('confirmCancel')}
          className="text-xs hover:text-danger hover:underline underline-offset-2 transition-colors"
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
        <StatusBox tone="alert" word="PV generated · awaiting Principal">
          {state.paidAmount > 0
            ? `已付 ${fmt(state.paidAmount)} / 总额 ${fmt(totalAmount)}`
            : `RM ${fmt(totalAmount)}`}
        </StatusBox>
      </div>
    )
  }

  // ─── Completed — HR Pool funded ───────────────────────────────────────────
  return (
    <div className="flex flex-col items-end gap-1">
      <StatusBox tone="ledger" word="✓ HR Pool funded">
        RM {fmt(totalAmount)}
      </StatusBox>
    </div>
  )
}

// Where the request stands: the state as a word on a wash (amber while it
// waits on Finance or Principal, green once the HR Pool is funded), the sum
// beside it in figures.
function StatusBox({ tone, word, children }: {
  tone: 'alert' | 'ledger'
  word: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 bg-surface border border-hairline rounded-lg px-3 py-2">
      <span className={`chip ${tone}`}>
        {tone === 'alert' ? <span className="dot" /> : null}
        {word}
      </span>
      <span className="font-mono text-xs tabular-nums">{children}</span>
    </div>
  )
}
