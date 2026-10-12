'use client'

import { useState, useTransition } from 'react'
import { setFundSourceRepaymentStart } from '../../actions'

// Finance self-service: the agreed first repayment for a fund source — the
// date its first instalment falls due, every later one on the same day of the
// month. Unset = the month after the effective date, on its day.
// 2026-10-09: a field of the page's Repayment settings panel (the handoff).
// 2026-10-12 (user: 现在只能选月份不能选日期 → expected repayment 和 repayment
// start date 应该要一样): a date, not a month; the page's Expected repayment is
// this date.
export default function RepaymentStartEditor({
  sourceId,
  current,
  defaultHint,
  min,
}: {
  sourceId: string
  current: string | null // YYYY-MM-DD
  defaultHint: string
  /** The effective date: the repayment does not start before it. */
  min?: string
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [value, setValue] = useState(current ?? '')

  return (
    <div className="fin-field">
      <label htmlFor="repayment-start">Repayment starts</label>
      <div className="fin-field-row">
        <input id="repayment-start" type="date" value={value} min={min} onChange={(e) => setValue(e.target.value)} />
        <button
          type="button"
          className="btn-sec"
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
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
        {saved && !isPending ? <span className="fin-saved">Saved ✓</span> : null}
      </div>
      <p className="fin-hint">
        The first installment is due on this date, and every one after it on the same day of the month. Unset, it is {defaultHint}.
      </p>
      {error ? <p className="fin-error">{error}</p> : null}
    </div>
  )
}
