'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { deleteStaff } from '../actions'

interface Props {
  staffId: string
  staffName: string
}

export default function StaffActions({ staffId }: Props) {
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteStaff(staffId)
      } catch {
        alert('Failed to delete staff')
      }
      setConfirming(false)
    })
  }

  if (confirming) {
    return (
      <div className="confirm-slide-in flex items-center gap-2">
        <button
          onClick={handleDelete}
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
      >
        Delete
      </button>
    </div>
  )
}
