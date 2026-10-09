'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { generateBaInvoice, setBaStatus } from '../../actions'
import { AttachmentChips, PvModal, type BankOption, type BaRow } from '../../_components/BaView'

// What Finance can do to a financing from its own page (2026-10-09, the
// handoff): bill the borrower for the charge (5028), pay HC through a PV
// (6001), and mark it settled once collected and repaid — releasing the
// limit — or reopen it. The same actions as the register's row.

export function BaDocuments({ row }: { row: BaRow }) {
  return <AttachmentChips row={row} full />
}

export default function BaDetailActions({ row, banks }: { row: BaRow; banks: BankOption[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const active = row.status === 'active'

  const run = (fn: () => Promise<{ error?: string } & Record<string, unknown>>, done: (r: Record<string, unknown>) => string) => {
    setError(null)
    setMessage(null)
    startTransition(async () => {
      const r = await fn()
      if (r.error) setError(r.error)
      else {
        setMessage(done(r))
        router.refresh()
      }
    })
  }

  return (
    <>
      <div className="fin-actions">
        {active && !row.interestInvoice ? (
          <button
            type="button"
            className="btn-pri"
            disabled={isPending}
            onClick={() => run(() => generateBaInvoice(row.id), (r) => `Invoice ${(r.invoiceNo as string | null) ?? ''} created as draft — review & issue it in Service Billing`)}
          >
            Bill borrower
          </button>
        ) : null}
        {active && !row.interestPv ? (
          <button type="button" className={row.interestInvoice ? 'btn-pri' : 'btn-sec'} disabled={isPending} onClick={() => setPaying(true)}>
            Pay HC
          </button>
        ) : null}
        {active ? (
          <button type="button" className="btn-sec" disabled={isPending} onClick={() => run(() => setBaStatus(row.id, 'settled'), () => 'Marked settled — the limit is released.')}>
            Mark settled
          </button>
        ) : row.status === 'settled' ? (
          <button type="button" className="btn-sec" disabled={isPending} onClick={() => run(() => setBaStatus(row.id, 'active'), () => 'Reopened.')}>
            Reopen
          </button>
        ) : null}
        <span className="note">
          {row.interestInvoice ? `Billed: ${row.interestInvoice.no ?? 'invoice'} · ${row.interestInvoice.status}. ` : ''}
          {row.interestPv ? `Paid to HC: ${row.interestPv.no ?? 'PV'} · ${row.interestPv.status}. ` : ''}
          {active
            ? 'Bill borrower drafts the charge as an invoice (5028); Pay HC drafts a PV to HOUZS Century (6001) for the bank and day you pick. Mark settled once it is collected and repaid — that releases the limit.'
            : 'Settled — nothing left to do on this financing.'}
        </span>
      </div>
      {message ? <div className="mt-3 border border-hairline rounded-md bg-surface p-3 text-sm font-sans text-ledger">✓ {message}</div> : null}
      {error ? <div className="mt-3 bg-danger-bg border border-danger text-danger rounded-md p-3 text-sm font-sans">{error}</div> : null}
      {paying ? (
        <PvModal
          row={row}
          banks={banks}
          onClose={() => setPaying(false)}
          onDone={(m) => {
            setPaying(false)
            setMessage(m)
            router.refresh()
          }}
        />
      ) : null}
    </>
  )
}
