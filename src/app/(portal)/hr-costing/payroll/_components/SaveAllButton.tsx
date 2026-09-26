'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { updatePayrollRows } from '../actions'
import { usePayrollDraft } from './PayrollDraftContext'

export default function SaveAllButton() {
  const router = useRouter()
  const { edits, commissionReviews, dirtyCount } = usePayrollDraft()
  const [isPending, setPending] = useState(false)
  const inFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    setError(null)
    setSaved(false)
    const reviews = Object.entries(commissionReviews)
    const reviewedIds = new Set(reviews.map(([id]) => id))
    // A reviewed Revenue row owns its mixed edits in one checked action.
    // Never send the same row through the ordinary batch afterward.
    const entries = Object.entries(edits)
      .filter(([id]) => !reviewedIds.has(id))
      .map(([id, fields]) => ({ id, fields }))
    try {
      // Keep modal-opening updates outside a transition while awaiting input.
      for (const [, review] of reviews) {
        if (!(await review())) {
          setError('Save cancelled. Remaining edits have not been saved.')
          return
        }
      }
      if (entries.length > 0) await updatePayrollRows(entries)
      setSaved(true)
      router.refresh()
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  if (dirtyCount === 0) {
    if (saved) {
      return (
        <span className="chip ledger self-center">
          ✓ Saved
        </span>
      )
    }
    return null
  }

  // Outline, not orange: Submit to Finance is the view's one primary action.
  // The orange edge marks it as the step that must come first.
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleSave}
        disabled={isPending}
        className="bg-surface hover:bg-surface-2 border border-accent text-ink text-sm font-medium px-4 py-2 rounded-control transition-colors disabled:opacity-50"
      >
        {isPending ? 'Saving…' : `Save ${dirtyCount} row${dirtyCount > 1 ? 's' : ''}`}
      </button>
      {error && (
        <span className="text-xs text-danger max-w-xs text-right">
          {error}
        </span>
      )}
    </div>
  )
}
