'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { flash } from '@/components/hrv/toast'
import { DialogConfirm, FinDialog } from '@/components/finv/Dialog'
import { issueStatementInWords, markStatementPaidInWords } from '../../actions'

// A statement's one step on the computer (2026-10-16 — the user: the desktop's
// one-way steps ask first, as the phone app's do since 2026-10-15). Issue and
// Mark as paid go one way — an issued statement locks (Generate statements
// skips it) and nothing on the portal takes either back — so each opens the
// phone's question: the company, the month and the net; a refusal stays in it,
// in words.

export default function StatementSteps({
  id,
  company,
  period,
  net,
  step,
}: {
  id: string
  company: string
  /** "September 2026". */
  period: string
  /** The net as the page writes it ("RM 21,907.90"). */
  net: string
  /** What the statement's status allows: Issue for a draft, Mark as paid once issued. */
  step: 'issue' | 'paid'
}) {
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, start] = useTransition()
  const paid = step === 'paid'

  const close = () => {
    if (!busy) setAsking(false)
  }
  const confirm = () => {
    setError(null)
    start(async () => {
      try {
        const res = paid ? await markStatementPaidInWords(id) : await issueStatementInWords(id)
        if (!res.ok) return setError(res.reason)
        setAsking(false)
        flash(paid ? 'Statement marked paid' : 'Statement issued')
        router.refresh()
      } catch {
        setError('That did not go through. Try again.')
      }
    })
  }

  return (
    <>
      <button
        type="button"
        className="btn-pri"
        onClick={() => {
          setError(null)
          setAsking(true)
        }}
      >
        {paid ? 'Mark as paid' : 'Issue to subsidiary'}
      </button>
      <FinDialog open={asking} onClose={close} title={paid ? `Mark ${company} paid?` : `Issue to ${company}?`} sub={`${period} · ${net}`} locked={busy}>
        <DialogConfirm
          text={paid ? 'This cannot be undone.' : 'An issued statement is locked — Generate statements skips it. This cannot be undone.'}
          confirmLabel={busy ? (paid ? 'Marking…' : 'Issuing…') : paid ? 'Mark as paid' : 'Issue statement'}
          busy={busy}
          error={error}
          onCancel={close}
          onConfirm={confirm}
        />
      </FinDialog>
    </>
  )
}
