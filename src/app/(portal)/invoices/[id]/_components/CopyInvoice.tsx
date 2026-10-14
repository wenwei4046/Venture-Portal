'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { DialogConfirm, FinDialog } from '@/components/finv/Dialog'
import s from '@/components/finv/full.module.css'
import { hubCopyInvoice } from '@/app/(portal)/statements/invoice-actions'

// An invoice's full page, its Copy (2026-10-15, the Finance revamp v2 — D06,
// the prototype's Copy beside Print on every full page): asked in the design's
// dialog with the hub's words, then the copy — a draft in this month with the
// same lines — opens on its own full page, to be changed before it is issued.

const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function CopyInvoice({ id, no, thisMonth }: { id: string; no: string | null; thisMonth: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const month = `${MONTH[Number(thisMonth.slice(5, 7)) - 1]} ${thisMonth.slice(0, 4)}`

  const copy = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await hubCopyInvoice(id)
      if (!res.ok) {
        setError(res.reason)
        return
      }
      flash(`Copied as ${res.value.no} — a new draft`)
      setOpen(false)
      router.push(`/invoices/${res.value.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The copy did not go through.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" className={s.topBtn} onClick={() => setOpen(true)}>
        Copy
      </button>
      <FinDialog open={open} onClose={() => !busy && setOpen(false)} title={`Copy ${no ?? 'this invoice'}?`} locked={busy}>
        <DialogConfirm
          text={`A new draft in ${month}, with the same lines — change what you need, then issue it.`}
          confirmLabel={busy ? 'Copying…' : 'Copy as new draft'}
          busy={busy}
          error={error}
          onCancel={() => setOpen(false)}
          onConfirm={copy}
        />
      </FinDialog>
    </>
  )
}
