'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updatePayrollRows } from '../actions'
import { usePayrollDraft } from './PayrollDraftContext'

export default function SaveAllButton() {
  const router = useRouter()
  const { edits, dirtyCount } = usePayrollDraft()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function handleSave() {
    setError(null)
    const entries = Object.entries(edits).map(([id, fields]) => ({ id, fields }))
    startTransition(async () => {
      try {
        await updatePayrollRows(entries)
        setSaved(true)
        router.refresh()
        setTimeout(() => setSaved(false), 2500)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed')
      }
    })
  }

  if (dirtyCount === 0) {
    if (saved) {
      return (
        <span className="font-serif italic text-ledger text-sm px-2 py-2">
          ✓ Saved
        </span>
      )
    }
    return null
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleSave}
        disabled={isPending}
        className="bg-surface hover:bg-surface-2 border border-accent-border text-accent font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50"
      >
        {isPending ? 'Saving…' : `Save ${dirtyCount} row${dirtyCount > 1 ? 's' : ''}`}
      </button>
      {error && (
        <span className="text-xs font-serif italic text-danger max-w-xs text-right">
          {error}
        </span>
      )}
    </div>
  )
}
