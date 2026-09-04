'use client'

import { useState, useTransition } from 'react'
import { setFundSourceMinPayInterest } from '../../actions'

// 最低还息单 (user 2026-09-04): flagged = "本金可以慢慢还，但每月利息一定要付".
// Finance self-service, editable anytime (旧单也能补设). Saves on toggle.
export default function MinPayInterestToggle({
  sourceId,
  current,
}: {
  sourceId: string
  current: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [value, setValue] = useState(current)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  return (
    <div className="mt-4">
      <div className="text-xs uppercase tracking-wide text-muted font-sans mb-1">
        最低还息 · Minimum pay interest
      </div>
      <label className="flex items-center gap-2">
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
              const r = await setFundSourceMinPayInterest(sourceId, next)
              if (r?.error) {
                setError(r.error)
                setValue(!next)
              } else {
                setSaved(true)
              }
            })
          }}
          className="h-4 w-4 accent-[var(--accent)]"
        />
        <span className="text-sm font-sans text-graphite">
          这笔资金每月最低要付利息（本金可以慢慢还）
        </span>
        {isPending ? <span className="text-xs font-sans text-muted">保存中…</span> : null}
        {saved && !isPending ? <span className="text-xs font-sans text-ledger">已保存 ✓</span> : null}
      </label>
      <p className="font-serif italic text-muted text-xs mt-1.5">
        勾了之后，Repayment schedule 会追踪当月利息付齐了没有，statement 上也会注明每月最低应还利息。
      </p>
      {error ? <p className="text-xs font-sans text-danger mt-1.5">{error}</p> : null}
    </div>
  )
}
