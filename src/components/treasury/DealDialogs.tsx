'use client'

import { useState } from 'react'
import { DialogConfirm, FinDialog } from '@/components/finv/Dialog'
import { voidRepayment } from '@/app/(portal)/fund-out/actions'
import { revertTermsChange } from '@/app/(portal)/fund-in/actions'

// A deal's two undo windows (2026-10-15), the kit's — on the deal's full page
// and, as a sheet, in the Finance phone app: void a loan's repayment (2026-08-20
// — the journal entry, the bank cache and the pool reversed at once by
// void_loan_repayment, the row gone; for one keyed against the wrong loan), and
// revert the latest terms change (Principal — the previous terms current
// again). They used to be the browser's own confirm, and an inline two-step,
// in Chinese on an English page.

type Answer = { error: string } | undefined

function useAsk(onDone: () => void, onClose: () => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => {
    if (busy) return
    setError(null)
    onClose()
  }
  const run = async (work: () => Promise<Answer>) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await work()
      if (res?.error) {
        setError(res.error)
        return
      }
      onClose()
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, close, run }
}

/** Void one repayment recorded on a loan. */
export function VoidRepaymentDialog({
  open,
  onClose,
  onDone,
  repaymentId,
  loanId,
  label,
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
  repaymentId: string
  loanId: string
  /** "principal RM 5,702.00 · 20 Aug 2026". */
  label: string
}) {
  const ask = useAsk(onDone, onClose)
  return (
    <FinDialog open={open} onClose={ask.close} title="Void this repayment?" sub={label} locked={ask.busy}>
      <DialogConfirm
        text="Its journal entry, the bank balance and the pool are all reversed, and it leaves the list. Record it again on the right loan afterwards."
        confirmLabel={ask.busy ? 'Voiding…' : 'Void repayment'}
        danger
        busy={ask.busy}
        error={ask.error}
        onCancel={ask.close}
        onConfirm={() =>
          void ask.run(() => {
            const fd = new FormData()
            fd.set('repayment_id', repaymentId)
            fd.set('loan_id', loanId)
            return voidRepayment(fd)
          })
        }
      />
    </FinDialog>
  )
}

/** Revert the latest terms change (from a month on). */
export function RevertTermsDialog({
  open,
  onClose,
  onDone,
  kind,
  recordId,
  latestFrom,
}: {
  open: boolean
  onClose: () => void
  onDone: () => void
  kind: 'loan' | 'fund_source'
  recordId: string
  /** YYYY-MM — the change being undone. */
  latestFrom: string
}) {
  const ask = useAsk(onDone, onClose)
  return (
    <FinDialog open={open} onClose={ask.close} title={`Revert the change from ${latestFrom}?`} locked={ask.busy}>
      <DialogConfirm
        text="The terms before it become the current terms again, and the change leaves the history."
        confirmLabel={ask.busy ? 'Reverting…' : 'Revert'}
        danger
        busy={ask.busy}
        error={ask.error}
        onCancel={ask.close}
        onConfirm={() => void ask.run(() => revertTermsChange(kind, recordId))}
      />
    </FinDialog>
  )
}
