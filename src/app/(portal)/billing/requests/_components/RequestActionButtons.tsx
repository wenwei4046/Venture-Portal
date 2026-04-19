'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { generateInvoicesFromRequest, rejectInvoiceRequest } from '../actions'

interface Props {
  requestId: string
}

export default function RequestActionButtons({ requestId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<'idle' | 'rejecting'>('idle')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleGenerate() {
    setError(null)
    startTransition(async () => {
      try {
        await generateInvoicesFromRequest(requestId)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed')
      }
    })
  }

  function handleReject() {
    setError(null)
    startTransition(async () => {
      try {
        await rejectInvoiceRequest(requestId, reason)
        router.refresh()
        setMode('idle')
        setReason('')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed')
      }
    })
  }

  if (mode === 'rejecting') {
    return (
      <div className="flex flex-col items-stretch gap-2 max-w-md">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Why are you rejecting this request?"
          className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={handleReject}
            disabled={isPending || !reason.trim()}
            className="bg-danger hover:bg-danger-hover text-white font-serif italic text-sm px-4 py-1.5 rounded-md disabled:opacity-50"
          >
            {isPending ? 'Rejecting…' : 'Confirm reject'}
          </button>
          <button
            onClick={() => { setMode('idle'); setReason('') }}
            disabled={isPending}
            className="text-sm font-sans text-muted hover:text-ink"
          >
            Cancel
          </button>
        </div>
        {error ? <span className="text-sm font-serif italic text-danger">{error}</span> : null}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleGenerate}
        disabled={isPending}
        className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md disabled:opacity-50"
      >
        {isPending ? 'Generating…' : 'Generate invoices'}
      </button>
      <button
        onClick={() => setMode('rejecting')}
        disabled={isPending}
        className="border border-danger text-danger hover:bg-danger-bg font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50"
      >
        Reject
      </button>
      {error ? <span className="text-sm font-serif italic text-danger">{error}</span> : null}
    </div>
  )
}
