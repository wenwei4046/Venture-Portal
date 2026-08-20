'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { voidRepayment } from '../../actions'

// Void one repayment row (2026-08-20): reverses the JE / bank / pool effects
// atomically via the void_loan_repayment RPC, then the row disappears from
// the history. For a repayment keyed against the wrong loan: void here,
// re-record on the right loan.

interface Props {
  repaymentId: string
  loanId: string
  /** e.g. "principal RM 5,702.00 on 20 Aug 2026" — shown in the confirm. */
  label: string
}

export default function VoidRepaymentButton({ repaymentId, loanId, label }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    if (
      !window.confirm(
        `撤销这笔还款 (${label})?\n\n分录、银行余额、资金池会全部自动反转，还款记录会从列表消失。之后请到正确的 loan 重新记录。`,
      )
    )
      return
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('repayment_id', repaymentId)
      fd.set('loan_id', loanId)
      const r = await voidRepayment(fd)
      if (r?.error) setError(r.error)
      else router.refresh()
    })
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="text-xs text-graphite hover:text-danger font-serif italic disabled:opacity-50"
        title="撤销这笔还款 — 分录/银行/资金池全部反转"
      >
        {isPending ? 'Voiding…' : 'Void'}
      </button>
      {error ? <span className="text-xs text-danger font-sans">{error}</span> : null}
    </span>
  )
}
