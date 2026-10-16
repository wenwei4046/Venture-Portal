'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setBaStatus } from '../../actions'
import { AttachmentChips, PvModal, type BankOption, type BaRow } from '../../_components/BaView'
import BillInterestDialog from '../../_components/BillInterestDialog'

// What Finance can do to a financing from its own page (2026-10-09, the
// handoff): bill the borrower for the charge (5028), pay HC through a PV
// (6001), and mark it settled once collected and repaid — releasing the
// limit — or reopen it. The same actions as the register's row.
//
// 2026-10-10 — in the handoff's words: Generate PV (the PV to HC, the primary
// action — it opens the bank and day to pay from) and Bill interest (the
// invoice to the borrower, while it is still to bill); Mark settled stays
// beside them. A settled one: Reopen. Beside the buttons, only what was billed
// and paid (2026-10-12, user: the descriptions made the view messy).
//
// 2026-10-16 — Bill interest asks first (BillInterestDialog), as the phone's
// does: it makes the borrower's invoice. Mark settled keeps one press — Reopen
// takes it back.

export function BaDocuments({ row }: { row: BaRow }) {
  return <AttachmentChips row={row} full />
}

export default function BaDetailActions({ row, banks }: { row: BaRow; banks: BankOption[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [billing, setBilling] = useState(false)
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

  const trail = `${row.interestInvoice ? `Billed: ${row.interestInvoice.no ?? 'invoice'} · ${row.interestInvoice.status}. ` : ''}${
    row.interestPv ? `Paid to HC: ${row.interestPv.no ?? 'PV'} · ${row.interestPv.status}. ` : ''
  }`

  return (
    <>
      <div className="fin-actions">
        {active && !row.interestPv ? (
          <button type="button" className="btn-pri" disabled={isPending} onClick={() => setPaying(true)}>
            Generate PV
          </button>
        ) : null}
        {active && !row.interestInvoice ? (
          <button
            type="button"
            className={row.interestPv ? 'btn-pri' : 'btn-sec'}
            disabled={isPending}
            onClick={() => {
              setError(null)
              setMessage(null)
              setBilling(true)
            }}
          >
            Bill interest
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
        {trail ? <span className="note">{trail.trim()}</span> : null}
      </div>
      {message ? <div className="mt-3 border border-hairline rounded-md bg-surface p-3 text-sm font-sans text-ledger">✓ {message}</div> : null}
      {error ? <div className="mt-3 bg-danger-bg border border-danger text-danger rounded-md p-3 text-sm font-sans">{error}</div> : null}
      <BillInterestDialog
        row={billing ? row : null}
        onClose={() => setBilling(false)}
        onDone={(no) => {
          setBilling(false)
          setMessage(`Invoice ${no ?? ''} created as draft — review & issue it in Service Billing`)
          router.refresh()
        }}
      />
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
