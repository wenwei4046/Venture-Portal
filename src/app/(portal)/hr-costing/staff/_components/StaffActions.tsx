'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { deactivateStaff } from '../actions'

interface Props {
  staffId: string
  staffName: string
}

export default function StaffActions({ staffId, staffName }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleDeactivate() {
    setError(null)
    startTransition(async () => {
      try {
        await deactivateStaff(staffId)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to deactivate')
      }
      setConfirming(false)
    })
  }

  if (confirming) {
    return (
      <div className="confirm-slide-in flex items-center gap-2 justify-end">
        <span className="text-xs font-serif italic text-muted mr-1">Deactivate {staffName}?</span>
        <button
          onClick={handleDeactivate}
          disabled={isPending}
          className="text-xs font-sans text-danger hover:underline disabled:opacity-50"
        >
          {isPending ? '...' : 'Confirm'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs font-sans text-muted hover:text-ink"
        >
          Cancel
        </button>
        {error && <span className="text-xs font-serif italic text-danger">{error}</span>}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 justify-end">
      <Link
        href={`/hr-costing/staff/${staffId}/edit`}
        className="text-xs font-sans text-muted hover:text-accent transition-colors"
      >
        Edit
      </Link>
      <button
        onClick={() => setConfirming(true)}
        className="text-xs font-sans text-muted hover:text-danger transition-colors"
        title="Mark as inactive. Payroll records are preserved."
      >
        Deactivate
      </button>
    </div>
  )
}
