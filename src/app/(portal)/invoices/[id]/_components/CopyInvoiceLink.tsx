'use client'

import { useState, useTransition } from 'react'
import { copyInvoice } from '@/app/(portal)/billing/actions'

// Copy beside PDF in an invoice page's head (2026-10-09, the handoff): the
// invoice again as a new draft for this month — the same action as Copy in
// Service Billing's row menu, which lands on the list with the new draft.
export default function CopyInvoiceLink({ id, invoiceNo }: { id: string; invoiceNo: string | null }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      <button
        type="button"
        disabled={isPending}
        title="Copy as a new draft for this month"
        className="btn-quiet-sheet"
        onClick={() => {
          if (!confirm(`Copy ${invoiceNo ?? 'this invoice'} as a new draft for this month? Change the amount or description on the draft before issuing it.`)) return
          setError(null)
          startTransition(async () => {
            const fd = new FormData()
            fd.set('invoice_id', id)
            try {
              await copyInvoice(fd)
            } catch (e) {
              // The copy lands on Service Billing by a redirect.
              if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) throw e
              setError(e instanceof Error ? e.message : 'Copy failed')
            }
          })
        }}
      >
        {isPending ? 'Copying…' : 'Copy'}
      </button>
      {error ? <span className="font-sans text-xs text-danger">{error}</span> : null}
    </>
  )
}
