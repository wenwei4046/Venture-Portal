'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { shareOrder, unshareOrder } from '../../../../run-actions'
import { shareOutcomeMessage } from '@/lib/commission/bill-share'
import type { BillShareOutcome } from './BillContextMenu'

interface Props {
  outcome: BillShareOutcome
  className: string
  buttonClassName: string
  /** Undo put the holders back: the notice now says so. */
  onChange: (outcome: BillShareOutcome) => void
  /**
   * Opens the holder's own ledger — on Comm Cal, where the part now sits.
   * Absent: no button (Sales orders lists both holders on the row).
   */
  onOpenHolder?: (staffId: string) => void
  /** The ledger being read: no button to open the one already open. */
  currentStaffId?: string | null
}

/**
 * The line *Share this bill…* leaves behind (2026-09-30): who holds the bill
 * now, one click to the new holder's ledger where the part now sits, and Undo
 * — which puts the part back as it was (no part, or the part it had). An error
 * stays on the line. Key it by the outcome so each one starts clean.
 */
export default function BillShareNotice({ outcome, className, buttonClassName, onChange, onOpenHolder, currentStaffId = null }: Props) {
  const router = useRouter()
  const [undoing, startUndo] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const { result } = outcome

  function undo() {
    setError(null)
    startUndo(async () => {
      try {
        const back = result.before === null
          ? await unshareOrder(outcome.orderId, result.staffId)
          : await shareOrder(outcome.orderId, result.staffId, result.before)
        if (!back.ok) {
          setError(back.reason)
          return
        }
        router.refresh()
        onChange({ orderId: outcome.orderId, orderNo: outcome.orderNo, result: back.result, undone: true })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'That did not save'
        if (!message.includes('NEXT_REDIRECT')) setError(message)
      }
    })
  }

  const canOpen = onOpenHolder && result.after !== null && result.staffId !== currentStaffId
  return <p className={className} role="status">
    {shareOutcomeMessage(result)}
    {canOpen && <>{' '}<button type="button" className={buttonClassName} onClick={() => onOpenHolder(result.staffId)}>
      Open {result.name}
    </button></>}
    {result.changed && !outcome.undone && <>{' '}<button type="button" className={buttonClassName} disabled={undoing} onClick={undo}>
      {undoing ? 'Undoing…' : 'Undo'}
    </button></>}
    {error && <span className="text-danger"> {error}</span>}
  </p>
}
