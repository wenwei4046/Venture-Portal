'use client'

import { useState, useTransition } from 'react'
import { DialogConfirm, FinDialog } from '@/components/finv/Dialog'
import { copyPaymentVoucher } from '../../actions'
import s from './full.module.css'

// The full page's Copy (2026-10-14, the Finance revamp v2 — D06): asked in the
// design's dialog, then the copy opens on its edit page as a new draft.

export default function CopyAsDraft({ voucherId, voucherNo }: { voucherId: string; voucherNo: string | null }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, startBusy] = useTransition()
  const copy = () =>
    startBusy(async () => {
      setError(null)
      const form = new FormData()
      form.set('voucher_id', voucherId)
      try {
        await copyPaymentVoucher(form)
      } catch (e) {
        if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) throw e
        setError(e instanceof Error ? e.message : 'The copy did not go through.')
      }
    })
  return (
    <>
      <button type="button" className={s.topBtn} onClick={() => setOpen(true)}>
        Copy
      </button>
      <FinDialog open={open} onClose={() => setOpen(false)} title={`Copy ${voucherNo ?? 'this voucher'}?`} locked={busy}>
        <DialogConfirm
          text={error ?? 'It opens on the edit page as a new draft, to be changed before it is submitted.'}
          confirmLabel={busy ? 'Copying…' : 'Copy as a new draft'}
          busy={busy}
          onCancel={() => setOpen(false)}
          onConfirm={copy}
        />
      </FinDialog>
    </>
  )
}
