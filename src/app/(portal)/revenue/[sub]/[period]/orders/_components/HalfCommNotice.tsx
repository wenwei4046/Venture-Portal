'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setHalfComm } from '../../../../run-actions'
import { halfCommNotice } from '@/lib/commission/bill-half-comm'
import type { BillHalfCommOutcome } from './BillContextMenu'

interface Props {
  outcome: BillHalfCommOutcome
  /** "September 2026". */
  monthLabel: string
  className: string
  buttonClassName: string
  /** Undo paid it in full again: the notice now says so. */
  onChange: (outcome: BillHalfCommOutcome) => void
}

/**
 * The line *Half comm…* leaves behind (2026-11-10, beside `BillCountNotice`):
 * what changed, and — while the bill is half — one click to pay it in full
 * again. A refusal stays on the line. Key it by the outcome so each starts clean.
 */
export default function HalfCommNotice({ outcome, monthLabel, className, buttonClassName, onChange }: Props) {
  const router = useRouter()
  const [undoing, startUndo] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function undo() {
    setError(null)
    startUndo(async () => {
      try {
        const answer = await setHalfComm(outcome.orderId, false)
        if (!answer.ok) {
          setError(answer.reason)
          return
        }
        router.refresh()
        onChange({ orderId: outcome.orderId, orderNo: outcome.orderNo, halved: false, result: answer.result })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'That did not save'
        if (!message.includes('NEXT_REDIRECT')) setError(message)
      }
    })
  }

  return <p className={className} role="status">
    {halfCommNotice(outcome, monthLabel)}
    {outcome.halved && <>{' '}<button type="button" className={buttonClassName} disabled={undoing} onClick={undo}>
      {undoing ? 'Undoing…' : 'Undo'}
    </button></>}
    {error && <span className="text-danger"> {error}</span>}
  </p>
}
