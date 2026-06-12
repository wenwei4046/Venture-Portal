'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { deleteJournalVoucher } from '../actions'

// Visible per-row actions for the manual-JV list (user 2026-06-12: Copy /
// Edit / Delete 按钮要放出来, not buried as tiny inline links).
export default function JvRowActions({ id, entryNo }: { id: string; entryNo: string | null }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    if (!window.confirm(`Delete ${entryNo ?? 'this voucher'}? GL, bank and pool effects are reversed. This cannot be undone.`)) return
    setError(null)
    startTransition(async () => {
      try {
        await deleteJournalVoucher(id)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Delete failed')
      }
    })
  }

  const btn =
    'px-2.5 py-1 border border-hairline rounded-md text-xs font-serif italic transition-colors'

  return (
    <div className="flex items-center justify-end gap-2">
      <Link
        href={`/reconciliation/journal-entries/${id}/edit`}
        className={`${btn} text-graphite hover:text-ink hover:bg-surface-2`}
      >
        Edit
      </Link>
      <Link
        href={`/reconciliation/journal-entries/new?from=${id}`}
        className={`${btn} text-accent hover:bg-accent-bg`}
        title="New voucher prefilled from this one — posts only when you submit"
      >
        Copy
      </Link>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className={`${btn} text-danger hover:bg-danger-bg disabled:opacity-50`}
      >
        {isPending ? 'Deleting…' : 'Delete'}
      </button>
      {error ? <span className="text-xs text-danger font-sans">{error}</span> : null}
    </div>
  )
}
