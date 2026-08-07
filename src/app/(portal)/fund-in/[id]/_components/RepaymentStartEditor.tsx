'use client'

import { useState, useTransition } from 'react'
import { setFundSourceRepaymentStart } from '../../actions'

// Finance self-service: agreed first-repayment month (还款起始月) for a fund
// source — drives the Loan Monitor's due-this-month. Unset = effective month +1.
export default function RepaymentStartEditor({
  sourceId,
  current,
  defaultHint,
}: {
  sourceId: string
  current: string | null // YYYY-MM
  defaultHint: string
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [value, setValue] = useState(current ?? '')

  return (
    <div className="mb-8">
      <div className="text-xs uppercase tracking-wide text-muted font-sans mb-1">
        Repayment starts
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
              const r = await setFundSourceRepaymentStart(sourceId, value)
              if (r?.error) setError(r.error)
              else setSaved(true)
            })
          }
          className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-md text-xs font-sans transition-colors disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && !isPending ? <span className="text-xs font-sans text-ledger">Saved ✓</span> : null}
      </div>
      <p className="font-serif italic text-muted text-xs mt-1.5">
        Which month the first installment falls in. Unset defaults to {defaultHint}. The Loan
        Monitor&apos;s due-this-month follows this.
      </p>
      {error ? <p className="text-xs font-sans text-danger mt-1.5">{error}</p> : null}
    </div>
  )
}
