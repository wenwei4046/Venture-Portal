'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createPayrollPeriod } from '../actions'

interface Props {
  period: string
}

export default function ImportInfotechEntryButton({ period }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      try {
        const { created } = await createPayrollPeriod(period)
        if (created === 0) {
          setError('No active staff — add staff before importing.')
          return
        }
        router.push(`/hr-costing/payroll/${period}/import`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to open import')
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50"
      >
        {isPending ? 'Opening…' : 'Import InfoTech'}
      </button>
      {error && <span className="text-sm font-serif italic text-danger">{error}</span>}
    </div>
  )
}
