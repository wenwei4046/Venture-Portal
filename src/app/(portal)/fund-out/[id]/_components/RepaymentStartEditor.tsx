'use client'

import { useState, useTransition } from 'react'
import { setLoanRepaymentStart } from '../../actions'

// Finance self-service: the agreed first-installment month (还款起始月) that
// drives the Loan Monitor's 本月应收. Unset = defaults to disbursement +1.
// 2026-10-09: a field of the page's Repayment settings panel (the handoff).
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
    <div className="fin-field">
      <label htmlFor="repayment-start">Repayment starts</label>
      <div className="fin-field-row">
        <input id="repayment-start" type="month" value={value} onChange={(e) => setValue(e.target.value)} />
        <button
          type="button"
          className="btn-sec"
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
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && !isPending ? <span className="fin-saved">Saved ✓</span> : null}
      </div>
      <p className="fin-hint">
        Which month the first installment falls in (agreed to start repaying in May — pick May). Unset defaults to {defaultHint}. The
        Loan Monitor&apos;s due-this-month follows this.
      </p>
      {error ? <p className="fin-error">{error}</p> : null}
    </div>
  )
}
