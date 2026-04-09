'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

interface Props {
  currentPeriod: string
}

export default function PeriodSelector({ currentPeriod }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [period, setPeriod] = useState(currentPeriod)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = `${e.target.value}-01`
    setPeriod(next)
    startTransition(() => {
      router.push(`/billing?period=${next}`)
    })
  }

  return (
    <div className="flex items-center gap-3">
      <label
        htmlFor="billing_period"
        className="font-sans text-xs uppercase tracking-wide text-muted"
      >
        Period
      </label>
      <input
        id="billing_period"
        type="month"
        value={period.slice(0, 7)}
        onChange={handleChange}
        disabled={isPending}
        className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border disabled:opacity-60"
      />
    </div>
  )
}
