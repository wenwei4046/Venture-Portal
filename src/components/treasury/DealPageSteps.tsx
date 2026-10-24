'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { DialogConfirm, FinDialog, Input } from '@/components/finv/Dialog'
import { fullStyles as s } from '@/components/finv/FullParts'

// A deal's steps on its full page (2026-10-15, the Finance revamp v2 — D06's
// dark panel, for a loan and a fund source): what its own page always let
// this reader do, stacked as the panel draws them — Amend terms on a live
// deal; a pending fund source's Edit; Cancel loan / Withdraw before it is
// approved (asked first; the list then); Request cancellation on an active one
// (a loan says why), shut — saying why — once a repayment is recorded; a
// cancellation already filed, said with who asked and when.

type Answer = { error: string } | undefined

export default function DealPageSteps({
  side,
  id,
  party,
  amount,
  status,
  amendHref,
  editHref,
  withdraw,
  requestCancel,
  cancelShut,
  pendingCancel,
}: {
  side: 'out' | 'in'
  id: string
  party: string
  amount: number
  status: string
  /** Amend terms (a live deal: Treasury · Approve changes them; Treasury · Edit files the change for the Principal). */
  amendHref?: string | null
  /** Edit (Treasury · Edit, a pending fund source). */
  editHref?: string | null
  /** Cancel loan / Withdraw (Treasury · Void) — one still waiting for approval. */
  withdraw?: ((id: string) => Promise<Answer>) | null
  /** Request cancellation (Treasury · Void) — an active one; a loan's asks a reason. */
  requestCancel?: ((id: string, reason: string) => Promise<Answer>) | null
  /** Why the cancellation is shut (a repayment recorded). */
  cancelShut?: string | null
  /** A cancellation already filed. */
  pendingCancel?: { by: string; at: string } | null
}) {
  const router = useRouter()
  const out = side === 'out'
  const base = out ? '/fund-out' : '/fund-in'
  const [ask, setAsk] = useState<'withdraw' | 'cancel' | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rm = `RM ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const close = () => {
    if (busy) return
    setAsk(null)
    setError(null)
  }
  const confirm = async () => {
    if (busy || !ask) return
    if (ask === 'cancel' && out && !reason.trim()) {
      setError('Say why it is cancelled — the Principal reads it.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = ask === 'withdraw' ? await withdraw!(id) : await requestCancel!(id, reason.trim())
      if (res?.error) {
        setError(res.error)
        return
      }
      setAsk(null)
      if (ask === 'withdraw') {
        flash(out ? `Loan to ${party} cancelled` : `Fund source from ${party} withdrawn`)
        router.push(base)
      } else {
        flash('Cancellation requested — waiting for Principal approval')
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const pending = status === 'pending_approval'
  const live = status === 'active' || status === 'matured'
  const buttons = [
    amendHref && status === 'active' ? (
      <Link key="amend" href={amendHref} className={s.pBtn}>
        Amend terms
      </Link>
    ) : null,
    editHref && pending ? (
      <Link key="edit" href={editHref} className={s.pBtn}>
        Edit
      </Link>
    ) : null,
    withdraw && pending ? (
      <button key="withdraw" type="button" className={s.pBtn} data-kind="danger" onClick={() => setAsk('withdraw')}>
        {out ? 'Cancel loan' : 'Withdraw'}
      </button>
    ) : null,
    requestCancel && status === 'active' && !pendingCancel ? (
      <button
        key="cancel"
        type="button"
        className={s.pBtn}
        data-kind="danger"
        disabled={!!cancelShut}
        title={cancelShut ?? undefined}
        onClick={() => {
          setReason('')
          setAsk('cancel')
        }}
      >
        Request cancellation
      </button>
    ) : null,
  ].filter(Boolean)

  if (buttons.length === 0 && !(pendingCancel && live)) return null
  return (
    <>
      {pendingCancel && live ? (
        <>
          <div className={s.pGroup}>Cancellation</div>
          <div className={s.pRow}>
            <span className={s.pRowLabel}>Requested</span>
            <span className={s.pRowValue}>
              <span className={s.pRowV}>{pendingCancel.by}</span>
              <span className={s.pRowSub}>{pendingCancel.at} · waiting for Principal</span>
            </span>
          </div>
        </>
      ) : null}
      {buttons.length > 0 ? <div className={s.pBar}>{buttons}</div> : null}

      <FinDialog
        open={ask !== null}
        onClose={close}
        locked={busy}
        title={ask === 'withdraw' ? (out ? `Cancel the loan to ${party}?` : `Withdraw the fund source from ${party}?`) : `Request the cancellation of ${out ? `the loan to ${party}` : `the fund source from ${party}`}?`}
      >
        <DialogConfirm
          text={
            ask === 'withdraw'
              ? out
                ? `It never went out — the ${rm} loan is cancelled and its approval request closes.`
                : `It was never booked — the ${rm} fund source is cancelled and its approval request closes.`
              : `The Principal decides it in Approvals; until then the ${out ? 'loan' : 'fund source'} stays active.`
          }
          confirmLabel={busy ? 'Working…' : ask === 'withdraw' ? (out ? 'Cancel loan' : 'Withdraw') : 'Request cancellation'}
          danger
          busy={busy}
          error={error}
          onCancel={close}
          onConfirm={() => void confirm()}
        >
          {ask === 'cancel' && out ? (
            <Input aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Why — e.g. wrong borrower, agreement voided" />
          ) : null}
        </DialogConfirm>
      </FinDialog>
    </>
  )
}
