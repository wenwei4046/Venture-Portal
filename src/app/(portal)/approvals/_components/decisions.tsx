'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition, type ReactNode } from 'react'
import { flash } from '@/components/hrv/toast'
import { DialogConfirm, FinDialog, TextArea } from '@/components/finv/Dialog'
import fm from '@/components/finv/form.module.css'
import { plural, rm, type ApprovalRecordModel, type ApprovalRow } from '@/lib/fin-app/approval-model'
import { approveRequestGroupPartial, approveRequestsBulk, rejectRequestsBulk } from '../actions'
import { approveLead, rejectLead } from '../_lib/decision-copy'

// The decisions themselves (2026-10-17 — moved out of the Finance phone app's Approvals, so the computer's hub
// decides exactly as the phone does): one request, what is ticked, a combined approval whole, or a combined
// approval's vouchers each its own way — asked in the kit's window (a bottom sheet in the app, a dialog on the
// computer), with the desktop queue's words, its notes, its overdraw and its reason, and sent through the queue's
// own Server Actions (their gates name /approvals). Answered in words: production hides a thrown message.

/** What a decision window is about: one request, what is ticked, a combined one, or a combined one's vouchers. */
export type DecisionAsk =
  | { kind: 'approve' | 'reject'; scope: 'one'; record: ApprovalRecordModel }
  | { kind: 'approve' | 'reject'; scope: 'bulk'; rows: ApprovalRow[] }
  | { kind: 'approve' | 'reject'; scope: 'group'; row: ApprovalRow }
  | { kind: 'split'; row: ApprovalRow; approve: string[]; reject: string[] }

/** What went through: the rows (their keys) that leave the waiting lists. */
export interface Decided {
  ask: DecisionAsk
  keys: string[]
}

export const OVERDRAW = '允许部门池透支 · Allow dept-pool overdraw'

const failedText = (failed: Array<{ description: string; error: string }>, done: number, verb: string) =>
  [done > 0 ? `${verb} ${done}.` : null, ...failed.map((f) => `${f.description === '—' ? 'A request' : f.description} — ${f.error}`)].filter(Boolean).join('\n')

export function useApprovalDecisions({
  onDecided,
  onPartly,
}: {
  /** Everything asked went through: the window has closed and the toast said so. */
  onDecided: (d: Decided) => void
  /** Some went through and some did not: the window stays, saying which; these keys left the lists. */
  onPartly?: (keys: string[]) => void
}): { ask: (a: DecisionAsk) => void; busy: boolean; dialog: ReactNode } {
  const router = useRouter()
  const [current, setCurrent] = useState<DecisionAsk | null>(null)
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')
  const [overdraw, setOverdraw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, startBusy] = useTransition()

  const ask = (a: DecisionAsk) => {
    setNotes('')
    setReason('')
    setOverdraw(false)
    setError(null)
    setCurrent(a)
  }
  const close = () => {
    if (!busy) setCurrent(null)
  }
  const decided = (a: DecisionAsk, keys: string[], said: string) => {
    setCurrent(null)
    flash(said)
    router.refresh()
    onDecided({ ask: a, keys })
  }

  const confirm = () => {
    const a = current
    if (!a || busy) return
    const text = reason.trim()
    if ((a.kind === 'reject' || (a.kind === 'split' && a.reject.length > 0)) && !text) {
      setError('Please give a reason — it goes on the audit trail.')
      return
    }
    setError(null)
    startBusy(async () => {
      try {
        if (a.kind === 'split') {
          const res = await approveRequestGroupPartial({
            groupId: a.row.groupId as string,
            approveApprovalIds: a.approve,
            rejectApprovalIds: a.reject,
            approveNotes: notes.trim(),
            rejectReason: text,
          })
          if (!res.ok) return setError(res.reason)
          decided(
            a,
            [a.row.key],
            a.reject.length === 0 ? `Approved ${plural(a.approve.length, 'voucher', 'vouchers')}` : a.approve.length === 0 ? `Rejected ${plural(a.reject.length, 'voucher', 'vouchers')}` : `Approved ${a.approve.length} · rejected ${a.reject.length}`,
          )
          return
        }
        const rows: ApprovalRow[] = a.scope === 'bulk' ? a.rows : a.scope === 'group' ? [a.row] : []
        const ids = a.scope === 'one' ? [a.record.id] : rows.filter((r) => r.kind === 'single' && r.id).map((r) => r.id as string)
        const groupIds = rows.filter((r) => r.kind === 'group' && r.groupId).map((r) => r.groupId as string)
        const keys = a.scope === 'one' ? [a.record.id] : rows.map((r) => r.key)
        const name = a.scope === 'one' ? (a.record.no ?? a.record.title) : a.scope === 'group' ? a.row.title : plural(rows.length, 'request', 'requests')
        const res = a.kind === 'approve' ? await approveRequestsBulk({ ids, groupIds, notes: notes.trim() || undefined, allowOverdraw: overdraw }) : await rejectRequestsBulk({ ids, groupIds, notes: text })
        if (res.failed.length > 0) {
          const failedKeys = new Set(res.failed.map((f) => (groupIds.includes(f.id) ? `g:${f.id}` : f.id)))
          const done = keys.filter((k) => !failedKeys.has(k))
          if (done.length > 0) {
            onPartly?.(done)
            router.refresh()
          }
          const count = 'approved' in res ? res.approved : res.rejected
          return setError(failedText(res.failed, count, a.kind === 'approve' ? 'Approved' : 'Rejected'))
        }
        decided(a, keys, `${a.kind === 'approve' ? 'Approved' : 'Rejected'} · ${name}`)
      } catch {
        setError('That did not go through. Try again.')
      }
    })
  }

  let dialog: ReactNode = null
  if (current) {
    const a = current
    const rows = a.kind === 'split' ? [a.row] : a.scope === 'bulk' ? a.rows : a.scope === 'group' ? [a.row] : []
    const n = rows.length
    const sum = a.kind !== 'split' && a.scope === 'one' ? (a.record.amount ?? 0) : rows.reduce((t, r) => t + r.amount, 0)
    const hasVoucher = a.kind !== 'split' && (a.scope === 'one' ? !!a.record.voucher : rows.some((r) => r.hasVoucher))
    let title: string
    let text: ReactNode
    let confirmLabel: string
    if (a.kind === 'split') {
      const ap = a.approve.length
      const rj = a.reject.length
      title = rj === 0 ? `Approve all ${ap}?` : ap === 0 ? `Reject all ${rj}?` : `Approve ${ap}, reject ${rj}?`
      text =
        rj === 0 ? (
          <>Every voucher in this request is approved and your decision recorded in the audit trail. <em>This cannot be undone.</em></>
        ) : ap === 0 ? (
          <>Every voucher in this request is rejected with your reason.</>
        ) : (
          <>The ticked vouchers are approved and the rest rejected with your reason, in one go. <em>This cannot be undone.</em></>
        )
      confirmLabel = rj === 0 ? `Yes, approve ${ap}` : ap === 0 ? `Yes, reject ${rj}` : 'Yes, decide'
    } else if (a.kind === 'approve') {
      title = a.scope === 'bulk' ? `Approve ${plural(n, 'request', 'requests')}?` : 'Approve this request?'
      text =
        a.scope === 'one' ? (
          <>{approveLead(a.record.type)} and records your decision in the audit trail. <em>This cannot be undone.</em></>
        ) : (
          <>This authorises {a.scope === 'bulk' ? 'every selected request' : 'every part of this combined request'} for execution and records your decision in the audit trail. <em>This cannot be undone.</em></>
        )
      confirmLabel = a.scope === 'bulk' ? `Yes, approve ${n}` : 'Yes, approve'
    } else {
      title = a.scope === 'bulk' ? `Reject ${plural(n, 'request', 'requests')}?` : 'Reject this request?'
      text =
        a.scope === 'one' ? (
          <>{rejectLead(a.record.type)}. A written reason is <em>required</em>.</>
        ) : (
          <>Every selected request is turned down with this reason: a voucher is voided, a loan or fund source cancelled. A combined approval is rejected whole.</>
        )
      confirmLabel = a.scope === 'bulk' ? `Yes, reject ${n}` : 'Yes, reject'
    }
    const needsReason = a.kind === 'reject' || (a.kind === 'split' && a.reject.length > 0)
    const takesNotes = a.kind === 'approve' || (a.kind === 'split' && a.approve.length > 0)
    dialog = (
      <FinDialog open onClose={close} title={title} sub={rm(sum)} locked={busy}>
        <DialogConfirm
          text={text}
          confirmLabel={busy ? 'Saving…' : confirmLabel}
          danger={a.kind === 'reject' || (a.kind === 'split' && a.approve.length === 0)}
          busy={busy}
          off={needsReason && !reason.trim()}
          error={error}
          onCancel={close}
          onConfirm={confirm}
        >
          {needsReason ? (
            <TextArea
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                if (e.target.value.trim()) setError(null)
              }}
              placeholder={a.kind === 'split' ? 'Why are these rejected? (shown to whoever sent them)' : 'Rejection reason (required)'}
              aria-label="Rejection reason"
            />
          ) : null}
          {takesNotes ? <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes for the audit trail (optional)" aria-label="Notes" /> : null}
          {a.kind === 'approve' && hasVoucher ? (
            <div className={fm.checks}>
              <label className={fm.check}>
                <input type="checkbox" checked={overdraw} onChange={(e) => setOverdraw(e.target.checked)} />
                <span className={fm.checkName}>{OVERDRAW}</span>
              </label>
            </div>
          ) : null}
        </DialogConfirm>
      </FinDialog>
    )
  }

  return { ask, busy, dialog }
}
