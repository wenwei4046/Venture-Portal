'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { DialogConfirm, FinDialog } from '@/components/finv/Dialog'
import { cancelDeptRequestInWords } from '../actions'

// Cancel request asks first on the computer (2026-10-16 — the user: the
// desktop's one-way steps ask first, as the phone app's do since 2026-10-15).
// It refunds the pool the request reserved and voids a pending voucher, so the
// link opens the phone's question — the request and its amount — and a
// refusal stays in it, in words.

export default function CancelDeptRequestButton({ requestId, label, amount }: { requestId: string; label: string; amount: string }) {
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()

  const close = () => {
    if (!busy) setAsking(false)
  }
  const confirm = () => {
    setError(null)
    start(async () => {
      try {
        const res = await cancelDeptRequestInWords(requestId, 'Cancelled by Finance from dept-requests page')
        if (!res.ok) return setError(res.reason)
        setAsking(false)
        flash('Request cancelled — the pool is refunded')
        router.refresh()
      } catch {
        setError('That did not go through. Try again.')
      }
    })
  }

  return (
    <div className="mt-2 text-right">
      <button
        type="button"
        className="text-xs text-danger hover:underline font-sans transition-colors"
        onClick={() => {
          setError(null)
          setAsking(true)
        }}
      >
        Cancel request (refunds the reserved pool)
      </button>
      <FinDialog open={asking} onClose={close} title={`Cancel ${label}?`} sub={amount} locked={busy}>
        <DialogConfirm
          text="The pool it reserved is refunded and a pending voucher voided. This cannot be undone."
          confirmLabel={busy ? 'Cancelling…' : 'Cancel request'}
          danger
          busy={busy}
          error={error}
          onCancel={close}
          onConfirm={confirm}
        />
      </FinDialog>
    </div>
  )
}
