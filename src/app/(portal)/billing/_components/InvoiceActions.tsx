'use client'

import { useTransition, useState } from 'react'
import { approveInvoice, approveInvoicesForPeriod } from '../actions'

export function ApproveInvoiceButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handle() {
    setError(null)
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('id', id)
        await approveInvoice(fd)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <div className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={handle}
        disabled={isPending}
        className="text-xs text-accent hover:text-accent-hover font-serif italic disabled:opacity-50"
      >
        {isPending ? 'Issuing…' : 'Approve & issue'}
      </button>
      {error ? <span className="text-xs text-danger font-sans mt-1">{error}</span> : null}
    </div>
  )
}

export function BulkIssueInvoicesButton({ period, count }: { period: string; count: number }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handle() {
    setError(null)
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('period_month', period)
        await approveInvoicesForPeriod(fd)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  return (
    <div className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={handle}
        disabled={isPending}
        className="text-xs bg-accent text-white px-3 py-1 rounded-md font-serif italic hover:bg-accent-hover disabled:opacity-50"
      >
        {isPending ? 'Issuing…' : `Approve all ${count} drafts`}
      </button>
      {error ? <span className="text-xs text-danger font-sans mt-1">{error}</span> : null}
    </div>
  )
}

