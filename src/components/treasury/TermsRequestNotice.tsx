'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { DialogConfirm, FinDialog } from '@/components/finv/Dialog'
import { withdrawTermsChange } from '@/app/(portal)/fund-in/actions'
import type { TermsRequestNote } from '@/lib/terms-change-request'
import c from './terms-request.module.css'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthWords = (ym: string) => (/^\d{4}-\d{2}$/.test(ym) ? `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : ym)

// A deal's terms change filed for the Principal, over its full page (2026-10-24 — the user: "finance manager 可以改条款，
// 但是经过principal approve 不就可以了？", shown as filed / approved / applied, "可以"): while it waits, what it asks
// from which month, who filed it and when — the terms stay as they are till it is approved — with Withdraw for whoever
// filed it (or the Principal) and, for the Principal, the way to the request. Decided, for a month: approved and in
// force from the month, or turned down with the Principal's words.

export default function TermsRequestNotice({
  kind,
  dealId,
  note,
  canRefile,
  approvalsHref,
}: {
  kind: 'loan' | 'fund_source'
  dealId: string
  note: TermsRequestNote
  /** Amend terms may file it again (a turned-down one). */
  canRefile?: boolean
  /** The request in Approvals, for whoever decides it. */
  approvalsHref?: string | null
}) {
  const router = useRouter()
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const from = monthWords(note.fromYM)
  const tone = note.status === 'pending' ? 'wait' : note.status === 'approved' ? 'ledger' : 'danger'
  const title =
    note.status === 'pending'
      ? 'Terms change waiting for the Principal'
      : note.status === 'approved'
        ? `Terms change approved — in force from ${from}`
        : 'Terms change turned down — the terms did not change'
  const filed = `Filed by ${note.by} · ${note.at}`
  const meta =
    note.status === 'pending'
      ? `${filed}${note.reason ? ` · “${note.reason}”` : ''}. The terms and the schedule stay as they are until it is approved.`
      : note.status === 'approved'
        ? `${filed} · approved by ${note.decidedBy ?? 'the Principal'}${note.decidedAt ? ` · ${note.decidedAt}` : ''}`
        : `${filed} · turned down by ${note.decidedBy ?? 'the Principal'}${note.decidedAt ? ` · ${note.decidedAt}` : ''}${note.note ? ` — “${note.note}”` : ''}${canRefile ? '. Amend terms files it again.' : ''}`

  const close = () => {
    if (busy) return
    setAsk(false)
    setError(null)
  }
  const withdraw = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await withdrawTermsChange(kind, dealId, note.id)
      if (res?.error) {
        setError(res.error)
        return
      }
      setAsk(false)
      flash('Terms change withdrawn — the terms stay as they are')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const pending = note.status === 'pending'
  return (
    <>
      <div className={c.notice} data-tone={tone} role="status">
        <div className={c.text}>
          <div className={c.title}>{title}</div>
          <div className={c.line}>
            <b>From {from}</b>
            {note.line ? ` · ${note.line}` : ''}
          </div>
          <div className={c.meta}>{meta}</div>
        </div>
        {pending && (approvalsHref || note.mayWithdraw) ? (
          <div className={c.acts}>
            {approvalsHref ? (
              <Link href={approvalsHref} className={c.btn}>
                Open in Approvals
              </Link>
            ) : null}
            {note.mayWithdraw ? (
              <button type="button" className={c.btn} onClick={() => setAsk(true)}>
                Withdraw
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <FinDialog open={ask} onClose={close} locked={busy} title="Withdraw the terms change?">
        <DialogConfirm
          text={`The change from ${from} is taken off the Principal's queue; the terms stay as they are. File it again with Amend terms.`}
          confirmLabel={busy ? 'Working…' : 'Withdraw'}
          danger
          busy={busy}
          error={error}
          onCancel={close}
          onConfirm={() => void withdraw()}
        />
      </FinDialog>
    </>
  )
}
