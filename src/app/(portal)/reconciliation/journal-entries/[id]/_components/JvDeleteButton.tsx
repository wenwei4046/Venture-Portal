'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { deleteJournalVoucher } from '../../actions'

/** Delete on a voucher's own page (2026-10-09): the list's Delete — its GL,
 *  bank and pool effects reversed — then back to the list. */
export default function JvDeleteButton({ id, entryNo }: { id: string; entryNo: string | null }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleDelete() {
    if (!window.confirm(`Delete ${entryNo ?? 'this voucher'}? GL, bank and pool effects are reversed. This cannot be undone.`)) return
    setError(null)
    startTransition(async () => {
      try {
        await deleteJournalVoucher(id)
        router.push('/reconciliation/journal-entries')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Delete failed')
      }
    })
  }

  return (
    <>
      <button type="button" onClick={handleDelete} disabled={isPending} className="btn-quiet-sheet text-danger">
        {isPending ? 'Deleting…' : 'Delete'}
      </button>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </>
  )
}
