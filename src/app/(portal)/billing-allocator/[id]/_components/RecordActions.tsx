'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { deleteAllocTxn } from '../../actions'
import { unwrap } from '../../_components/unwrap'

// What Finance can do to an allocation from its own page (2026-10-09, the
// handoff's Actions panel). Billed: open the batch's invoices. Not billed:
// send the record back to Calculate to be corrected, or delete it — and
// raise the month's draft invoices with the page head's Generate invoices
// (2026-10-10, the handoff: the primary sits in the head).

export interface RecordInvoice {
  id: string
  invoiceNo: string
  /** Who it bills — the company's short code or the department. */
  billTo: string
}

export default function RecordActions({
  id,
  txnNo,
  period,
  billed,
  invoices,
}: {
  id: string
  txnNo: string
  /** 'YYYY-MM' */
  period: string
  billed: boolean
  invoices: RecordInvoice[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const listHref = `/billing-allocator?period=${period}`

  const run = (fn: () => Promise<void>) => {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed')
      }
    })
  }

  return (
    <>
      <div className="fin-actions">
        {billed ? (
          invoices.map((inv) => (
            // invoice-doc is the per-invoice document view (a /statements/[id]
            // link 404s — that route is monthly statements, user 2026-08-01).
            <Link key={inv.id} href={`/billing/invoice-doc?id=${inv.id}`} target="_blank" rel="noopener noreferrer" className="btn-sec">
              View {inv.invoiceNo} · {inv.billTo}
            </Link>
          ))
        ) : (
          <>
            <Link href={`${listHref}&edit=${id}`} className="btn-sec">
              Correct this record
            </Link>
            <button
              type="button"
              className="btn-danger"
              disabled={isPending}
              onClick={() => {
                if (!window.confirm(`Delete ${txnNo}? The allocation is removed before any invoice is made.`)) return
                run(async () => {
                  unwrap(await deleteAllocTxn(id))
                  router.push(listHref)
                })
              }}
            >
              Delete
            </button>
          </>
        )}
      </div>

      {error ? <div className="mt-3 bg-danger-bg border border-danger text-danger rounded-md p-3 text-sm font-sans">{error}</div> : null}
    </>
  )
}
