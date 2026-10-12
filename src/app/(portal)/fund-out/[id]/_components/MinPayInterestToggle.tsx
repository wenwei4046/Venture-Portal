'use client'

import { useState, useTransition } from 'react'
import { setLoanMinPayInterest } from '../../actions'

// 最低还息单 (user 2026-09-04): flagged = "本金可以慢慢还，但每月利息一定要还".
// Finance self-service, editable anytime (旧单也能补设). Saves on toggle.
// 2026-10-09: a field of the page's Repayment settings panel (the handoff).
export default function MinPayInterestToggle({
  loanId,
  current,
}: {
  loanId: string
  current: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [value, setValue] = useState(current)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  return (
    <div className="fin-field span-2">
      <span className="fin-label">Minimum pay interest</span>
      <label className="fin-toggle">
        <input
          type="checkbox"
          checked={value}
          disabled={isPending}
          onChange={(e) => {
            const next = e.target.checked
            setValue(next)
            setError(null)
            setSaved(false)
            startTransition(async () => {
              const r = await setLoanMinPayInterest(loanId, next)
              if (r?.error) {
                setError(r.error)
                setValue(!next)
              } else {
                setSaved(true)
              }
            })
          }}
        />
        <span>Interest must be paid in full every month (principal can be repaid gradually)</span>
        {isPending ? <span className="fin-saved text-muted">Saving…</span> : null}
        {saved && !isPending ? <span className="fin-saved">Saved ✓</span> : null}
      </label>
      {error ? <p className="fin-error">{error}</p> : null}
    </div>
  )
}
