'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { DialogConfirm, FinDialog } from '@/components/finv/Dialog'
import { sendBackPayrollInWords } from '../actions'

// 打回 HR 重做 (2026-09-15): Finance-side reopen of a submitted staff payroll
// run; the RPC does the real guarding (no funding PV yet, period open) and the
// accrual reversal. 2026-10-16 — it asks in the kit's question, the phone
// app's words (*Send back to HR*), instead of the inline second click in
// Chinese: the desktop's one-way steps ask first, as the phone's do (the
// user). A refusal stays in the question, in words.
export default function SendBackButton({ period, periodLabel, batchId = null }: { period: string; periodLabel: string; batchId?: string | null }) {
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
        // A batch goes back on its own; a request from before batches, the month.
        const res = await sendBackPayrollInWords(batchId, period)
        if (!res.ok) return setError(res.reason)
        setAsking(false)
        flash(`${periodLabel} sent back to HR`)
        router.refresh()
      } catch {
        setError('That did not go through. Try again.')
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null)
          setAsking(true)
        }}
        className="text-xs font-serif italic rounded px-2 py-1 transition-colors text-muted hover:text-danger"
      >
        Send back to HR
      </button>
      <FinDialog open={asking} onClose={close} title={`Send ${periodLabel} back to HR?`} locked={busy}>
        <DialogConfirm
          text="The request is cancelled, its payroll accruals reversed, and its people go back to Completed for HR to change and submit again. This cannot be undone."
          confirmLabel={busy ? 'Sending back…' : 'Send back'}
          danger
          busy={busy}
          error={error}
          onCancel={close}
          onConfirm={confirm}
        />
      </FinDialog>
    </>
  )
}
