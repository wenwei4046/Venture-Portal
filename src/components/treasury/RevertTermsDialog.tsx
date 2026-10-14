'use client'

import { DialogConfirm, FinDialog } from '@/components/finv/Dialog'
import { revertTermsChange } from '@/app/(portal)/fund-in/actions'
import { useDealAsk } from './deal-ask'

// Revert the latest terms change (2026-10-15, the kit's window — on a deal's
// full page and, as a sheet, in the Finance phone app): the Principal puts the
// previous terms back as the current ones. It was an inline two-step, in
// Chinese on an English page.

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
  const ask = useDealAsk(onDone, onClose)
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
