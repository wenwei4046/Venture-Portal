'use client'

import { useEffect, useState, useTransition } from 'react'
import { DialogConfirm, FinDialog } from '@/components/finv/Dialog'
import { calcOf } from '@/lib/fin-app/ba-model'
import { formatMoney } from '@/lib/utils'
import { generateBaInvoice } from '../actions'
import type { BaRow } from './BaView'

// Bill interest asks first on the computer (2026-10-16 — the user: the
// desktop's one-way steps ask first, as the phone app's do since 2026-10-15).
// It makes the borrower's draft invoice (5028), so a financing's page and the
// register's right-click open the phone's question — the borrower, the
// financing and its charge — and a refusal stays in it, in words.

export default function BillInterestDialog({
  row,
  onClose,
  onDone,
}: {
  /** The financing being billed; null — the question is shut. */
  row: BaRow | null
  onClose: () => void
  onDone: (invoiceNo: string | null) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()
  useEffect(() => {
    if (row) setError(null)
  }, [row])

  const close = () => {
    if (!busy) onClose()
  }
  const confirm = () => {
    if (!row) return
    setError(null)
    start(async () => {
      try {
        const res = await generateBaInvoice(row.id)
        if (res.error) return setError(res.error)
        onDone(res.invoiceNo ?? null)
      } catch {
        setError('That did not go through. Try again.')
      }
    })
  }

  return (
    <FinDialog
      open={row !== null}
      onClose={close}
      title={`Bill ${row?.borrower ?? 'the borrower'}?`}
      sub={row ? `${row.baNo ?? 'Financing'} · ${formatMoney(calcOf(row).chargeToBorrower)}` : undefined}
      locked={busy}
    >
      <DialogConfirm
        text="The interest goes out as a draft invoice (5028) to review and issue in Invoices."
        confirmLabel={busy ? 'Billing…' : 'Bill interest'}
        busy={busy}
        error={error}
        onCancel={close}
        onConfirm={confirm}
      />
    </FinDialog>
  )
}
