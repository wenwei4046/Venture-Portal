'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { moveOrder } from '../../../../run-actions'
import { moveMessage } from '@/lib/commission/bill-move'
import type { BillMoveOutcome } from './BillContextMenu'

interface Props {
  outcome: BillMoveOutcome
  className: string
  buttonClassName: string
  /** Undo moved it back: the notice now says so. */
  onChange: (outcome: BillMoveOutcome) => void
  /**
   * Opens the new holder's own ledger — on Comm Cal, where the bill now sits.
   * Absent: no button (All bills names the salesperson on the row).
   */
  onOpenHolder?: (staffId: string) => void
  /** The ledger being read: no button to open the one already open. */
  currentStaffId?: string | null
}

/**
 * The line *Move to another salesperson…* leaves behind (2026-10-12): whose
 * the bill is now, one click to their ledger, and Undo — which moves it back
 * to whoever had it. An error stays on the line. Key it by the outcome so each
 * one starts clean.
 */
export default function BillMoveNotice({ outcome, className, buttonClassName, onChange, onOpenHolder, currentStaffId = null }: Props) {
  const router = useRouter()
  const [undoing, startUndo] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const { result } = outcome

  function undo() {
    setError(null)
    startUndo(async () => {
      try {
        const back = await moveOrder(result.orderId, result.from.staffId)
        if (!back.ok) {
          setError(back.reason)
          return
        }
        router.refresh()
        onChange({ result: back.result, undone: true })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'That did not save'
        if (!message.includes('NEXT_REDIRECT')) setError(message)
      }
    })
  }

  const holder = result.to.staffId
  const canOpen = onOpenHolder && result.changed && holder && holder !== currentStaffId
  return <p className={className} role="status">
    {moveMessage(result)}
    {canOpen && <>{' '}<button type="button" className={buttonClassName} onClick={() => onOpenHolder(holder)}>
      Open {result.to.name}
    </button></>}
    {result.changed && !outcome.undone && <>{' '}<button type="button" className={buttonClassName} disabled={undoing} onClick={undo}>
      {undoing ? 'Undoing…' : 'Undo'}
    </button></>}
    {error && <span className="text-danger"> {error}</span>}
  </p>
}
