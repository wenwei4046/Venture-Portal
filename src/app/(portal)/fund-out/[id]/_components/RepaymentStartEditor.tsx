'use client'

import { useState, useTransition } from 'react'
import { setLoanRepaymentStart } from '../../actions'

// Finance self-service: the agreed first-installment month (还款起始月) that
// drives the Loan Monitor's 本月应收. Unset = defaults to disbursement +1.
export default function RepaymentStartEditor({
  loanId,
  current,
  defaultHint,
}: {
  loanId: string
  current: string | null // YYYY-MM
  defaultHint: string
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [value, setValue] = useState(current ?? '')

  return (
    <div className="mt-4">
      <div className="text-xs uppercase tracking-wide text-muted font-sans mb-1">
        还款起始月 · Repayment starts
      </div>
      <div className="flex items-center gap-2">
        <input
          type="month"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="px-3 py-1.5 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
        />
        <button
          type="button"
          disabled={isPending || !value}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              setSaved(false)
              const r = await setLoanRepaymentStart(loanId, value)
              if (r?.error) setError(r.error)
              else setSaved(true)
            })
          }
          className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-md text-xs font-sans transition-colors disabled:opacity-50"
        >
          {isPending ? '保存中…' : '保存'}
        </button>
        {saved && !isPending ? <span className="text-xs font-sans text-ledger">已保存 ✓</span> : null}
      </div>
      <p className="font-serif italic text-muted text-xs mt-1.5">
        第一期落在哪个月(比如谈好 5 月起还就选 5 月)。没设的话默认 {defaultHint} 起。
        Loan Monitor 的「本月应收」按这个算。
      </p>
      {error ? <p className="text-xs font-sans text-danger mt-1.5">{error}</p> : null}
    </div>
  )
}
