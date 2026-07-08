'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import dayjs from 'dayjs'

interface Props {
  currentPeriod: string
}

export default function PeriodSelector({ currentPeriod }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [period, setPeriod] = useState(currentPeriod)

  // period is stored as YYYY-MM-01; navigate keeps that shape.
  function go(next: string) {
    setPeriod(next)
    startTransition(() => {
      router.push(`/billing?period=${next}`)
    })
  }
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.value) go(`${e.target.value}-01`)
  }
  const prev = dayjs(period).subtract(1, 'month').format('YYYY-MM-01')
  const next = dayjs(period).add(1, 'month').format('YYYY-MM-01')

  const btn =
    'px-2.5 py-2 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-graphite hover:text-ink transition-colors text-sm leading-none disabled:opacity-60'

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="billing_period"
        className="font-sans text-xs uppercase tracking-wide text-muted mr-1"
      >
        Period
      </label>
      <button type="button" onClick={() => go(prev)} disabled={isPending} className={btn} aria-label="Previous month" title="Previous month">‹</button>
      <input
        id="billing_period"
        type="month"
        value={period.slice(0, 7)}
        onChange={handleChange}
        disabled={isPending}
        className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border disabled:opacity-60"
      />
      <button type="button" onClick={() => go(next)} disabled={isPending} className={btn} aria-label="Next month" title="Next month">›</button>
    </div>
  )
}
