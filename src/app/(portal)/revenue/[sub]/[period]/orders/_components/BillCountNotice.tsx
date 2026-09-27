'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { includeOrder } from '../../../../run-actions'
import type { BillMenuOutcome } from './BillContextMenu'

const ORDINAL = ['', '1st', '2nd', '3rd'] as const

/** What taking a bill out — or counting it again — did, in words. */
export function billOutcomeMessage(outcome: BillMenuOutcome, monthLabel: string, hasRun: boolean): string {
  const rank = outcome.result.openBillRank
  if (outcome.excluded) {
    return `${outcome.orderNo} no longer counts in ${monthLabel}${rank ? ` and gave up its ${ORDINAL[rank]} Open Bill` : ''}.`
      + (hasRun ? ' Payroll follows when the month is sent.' : '')
  }
  if (outcome.result.counts === false) {
    return `${outcome.orderNo} is no longer out by hand, but it still does not count: ${outcome.result.stillOut ?? 'it is excluded'}.`
  }
  return `${outcome.orderNo} counts again${rank ? `, back as the ${ORDINAL[rank]} Open Bill` : ''}.`
    + (hasRun ? ' Payroll follows when the month is sent.' : '')
}

interface Props {
  outcome: BillMenuOutcome
  /** "September 2026". */
  monthLabel: string
  /** The month has a saved run, which the change leaves behind until it is computed again. */
  hasRun: boolean
  className: string
  buttonClassName: string
  /** Undo counted the bill again: the notice now says so. */
  onChange: (outcome: BillMenuOutcome) => void
}

/**
 * The line a bill's menu leaves behind (2026-09-27, shared by All bills and a
 * salesperson's ledger): what changed, and — while the bill is out — one
 * click to put it back. An error stays on the line; the notice does not claim
 * a count it did not make. Key it by the outcome so each one starts clean.
 */
export default function BillCountNotice({ outcome, monthLabel, hasRun, className, buttonClassName, onChange }: Props) {
  const router = useRouter()
  const [undoing, startUndo] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function undo() {
    setError(null)
    startUndo(async () => {
      try {
        const result = await includeOrder(outcome.orderId)
        router.refresh()
        onChange({ orderId: outcome.orderId, orderNo: outcome.orderNo, excluded: false, result })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'That did not save'
        if (!message.includes('NEXT_REDIRECT')) setError(message)
      }
    })
  }

  return <p className={className} role="status">
    {billOutcomeMessage(outcome, monthLabel, hasRun)}
    {outcome.excluded && <>{' '}<button type="button" className={buttonClassName} disabled={undoing} onClick={undo}>
      {undoing ? 'Undoing…' : 'Undo'}
    </button></>}
    {error && <span className="text-danger"> {error}</span>}
  </p>
}
