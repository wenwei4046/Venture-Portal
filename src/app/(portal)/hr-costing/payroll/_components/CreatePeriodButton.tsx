'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPayrollPeriod } from '../actions'

interface Props {
  period: string
}

export default function CreatePeriodButton({ period }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      try {
        const { created } = await createPayrollPeriod(period)
        router.refresh()
        router.push(`/hr-costing/payroll/${period}`)
        if (created === 0) setError('No active staff — add staff first')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create period')
      }
    })
  }

  const label = new Date(period + 'T00:00:00Z').toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50"
      >
        {isPending ? 'Creating...' : `+ Create ${label} period`}
      </button>
      {error && <span className="text-sm font-serif italic text-danger">{error}</span>}
    </div>
  )
}
