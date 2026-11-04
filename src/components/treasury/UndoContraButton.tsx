'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DialogConfirm, FinDialog } from '@/components/finv/Dialog'
import { useDealAsk } from '@/components/treasury/deal-ask'
import { undoFundContra } from '@/app/(portal)/fund-out/contra-actions'

// Undo a fund contra (2026-11-04 — the user: "contra 错了怎么办？" → "有 Void 权限就直接撤回"): a repayment a contra wrote
// cannot be voided alone — its other side and its journal entry would be left standing — so its row offers this
// instead: the whole contra taken back at once (undo_fund_contra), every deal in it as it was before.

export default function UndoContraButton({ contraId, label }: { contraId: string; label: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const ask = useDealAsk(() => router.refresh(), () => setOpen(false))
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-graphite hover:text-danger font-serif italic" title="Part of a fund contra — undo the whole contra">
        Undo contra
      </button>
      <FinDialog open={open} onClose={ask.close} title="Undo this contra?" sub={label} locked={ask.busy}>
        <DialogConfirm
          text="The whole contra is taken back: a reversing journal entry, every repayment it wrote on both sides removed, and the Venture Pool countered. Each loan and fund source owes again what it owed before."
          confirmLabel={ask.busy ? 'Undoing…' : 'Undo contra'}
          danger
          busy={ask.busy}
          error={ask.error}
          onCancel={ask.close}
          onConfirm={() =>
            void ask.run(async () => {
              const r = await undoFundContra(contraId)
              return r.ok ? undefined : { error: r.reason }
            })
          }
        />
      </FinDialog>
    </>
  )
}
