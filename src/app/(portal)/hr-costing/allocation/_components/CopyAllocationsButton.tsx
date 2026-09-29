'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { splitCopyNote } from '@/lib/staff-allocation'
import { copyAllocationsFromLastMonth } from '../actions'

export default function CopyAllocationsButton({ period }: { period: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [note, setNote] = useState<string | null>(null)

  function run() {
    setNote(null)
    startTransition(async () => {
      try {
        const { copiedStaff, lockedStaff, notOnPayrollStaff } =
          await copyAllocationsFromLastMonth(period)
        setNote(splitCopyNote({ copied: copiedStaff, locked: lockedStaff, notOnPayroll: notOnPayrollStaff }))
        router.refresh()
      } catch (e) {
        setNote(e instanceof Error ? e.message : String(e))
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={isPending}
        className="bg-surface hover:bg-surface-2 border border-hairline text-ink text-sm px-3 py-2 rounded-control transition-colors disabled:opacity-40"
      >
        {isPending ? 'Copying…' : 'Copy from last month'}
      </button>
      {note && <span className="text-[11px] max-w-[260px] text-right">{note}</span>}
    </div>
  )
}
