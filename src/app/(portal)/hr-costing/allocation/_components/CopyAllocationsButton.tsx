'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { copyAllocationsFromLastMonth } from '../actions'

export default function CopyAllocationsButton({ period }: { period: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [note, setNote] = useState<string | null>(null)

  function run() {
    setNote(null)
    startTransition(async () => {
      try {
        const { copiedStaff } = await copyAllocationsFromLastMonth(period)
        setNote(
          copiedStaff === 0
            ? 'Nothing to copy — no last-month splits, or everyone already set.'
            : `Copied splits for ${copiedStaff} staff.`,
        )
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
        className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-3 py-2 rounded-md transition-colors disabled:opacity-40"
      >
        {isPending ? 'Copying…' : 'Copy from last month'}
      </button>
      {note && <span className="font-mono text-[11px] text-muted max-w-[260px] text-right">{note}</span>}
    </div>
  )
}
