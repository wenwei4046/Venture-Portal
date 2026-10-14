'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { VoidRepaymentDialog } from './VoidRepaymentDialog'

// Void one repayment row (2026-08-20): reverses the JE / bank / pool effects
// atomically via the void_loan_repayment RPC, then the row disappears from
// the history. For a repayment keyed against the wrong loan: void here,
// re-record on the right loan. Asked in the kit's window since 2026-10-15
// (the Finance phone app asks the same one).

interface Props {
  repaymentId: string
  loanId: string
  /** e.g. "principal RM 5,702.00 · 20 Aug 2026" — shown in the confirm. */
  label: string
}

export default function VoidRepaymentButton({ repaymentId, loanId, label }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-graphite hover:text-danger font-serif italic" title="Void this repayment — its journal entry, bank and pool reversed">
        Void
      </button>
      <VoidRepaymentDialog open={open} onClose={() => setOpen(false)} onDone={() => router.refresh()} repaymentId={repaymentId} loanId={loanId} label={label} />
    </>
  )
}
