'use client'

import { DialogConfirm, FinDialog } from '@/components/finv/Dialog'
import { useDealAsk } from '@/components/treasury/deal-ask'
import { voidRepayment } from '../../actions'

// Void one repayment recorded on a loan (2026-10-15, the kit's window — on the
// loan's full page and, as a sheet, in the Finance phone app): the journal
// entry, the bank cache and the pool reversed at once by void_loan_repayment,
// the row gone (2026-08-20 — for one keyed against the wrong loan). It was the
// browser's own confirm, in Chinese on an English page.

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
  const ask = useDealAsk(onDone, onClose)
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
