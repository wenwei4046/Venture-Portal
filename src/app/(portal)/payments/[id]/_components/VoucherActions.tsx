'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'

interface Props {
  voucherId: string
  status: string
  amount: number
  bankBalance: number | null
  bankName: string | null
  /** What the reader may do (2026-10-08, PR2) — each the action its Server Action asks. */
  can: { create: boolean; edit: boolean; void: boolean; approve: boolean }
  submitForApproval: (formData: FormData) => Promise<void>
  approveVoucher: (formData: FormData) => Promise<void>
  voidVoucher: (formData: FormData) => Promise<void>
  /** Pull a pending voucher back to draft (closes its approval card) so it
   *  can be resubmitted — e.g. after submitting with the wrong account. */
  returnToDraft?: (formData: FormData) => Promise<void>
  /** Reverse a PAID incoming receipt (credit). Optional — only wired for those. */
  voidPaidReceipt?: (formData: FormData) => Promise<void>
  /** Reverse a PAID outgoing payment (debit). Optional. */
  reversePaidPayment?: (formData: FormData) => Promise<void>
  direction?: string
  voucherType?: string
}

// Drawn INSIDE the voucher page's navy panel (2026-10-02). These used to be a
// section of their own under the audit trail and the attachments — a screen and
// a half down from the amount they act on (user: "这个 pv 点开看 detail 也是很
// 乱"). What each state offers, and what each button does, is unchanged.
const NOTE = 'deal-side-note rounded-md px-3 py-2.5 font-sans text-[12.5px] leading-relaxed'
const PRIMARY =
  'deal-side-btn w-full rounded-md px-4 py-2.5 font-sans text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const SECOND =
  'deal-side-btn2 block w-full rounded-md px-3 py-2 text-center font-sans text-[13.5px] transition-colors disabled:opacity-50'
const QUIET = 'deal-side-link font-sans text-[12.5px] transition-colors disabled:opacity-50'

export default function VoucherActions({
  voucherId,
  status,
  amount,
  bankBalance,
  bankName,
  can,
  submitForApproval,
  approveVoucher,
  voidVoucher,
  returnToDraft,
  voidPaidReceipt,
  reversePaidPayment,
  direction,
  voucherType,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [confirmAction, setConfirmAction] = useState<'approve' | null>(null)
  const [notes, setNotes] = useState('')

  // A payroll funding PV is a no-cash accrual (Dr 9030 / Cr 4020): it draws the
  // dept pools and books the salary expense but does NOT charge the source bank,
  // so bank balance never gates its approval. Cash leaves at Stage-G disbursement.
  const isNoCashPayroll = voucherType === 'payroll_bank_transfer'
  const bankShortBlocks = !isNoCashPayroll && bankBalance !== null && bankBalance < amount

  async function handleAction(action: (fd: FormData) => Promise<void>, extraFields?: Record<string, string>) {
    setMessage(null)
    const fd = new FormData()
    fd.set('id', voucherId)
    if (extraFields) {
      Object.entries(extraFields).forEach(([k, v]) => fd.set(k, v))
    }
    startTransition(async () => {
      try {
        await action(fd)
        setMessage({ type: 'success', text: 'Done.' })
        setConfirmAction(null)
      } catch (err) {
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) throw err
        setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Unknown error' })
      }
    })
  }

  const isReceipt = direction === 'credit'
  const result = message ? (
    <p className={`${NOTE} ${message.type === 'error' ? 'bad' : 'ok'}`} role={message.type === 'error' ? 'alert' : 'status'}>
      {message.text}
    </p>
  ) : null

  // Status-driven rendering
  if (status === 'paid' || status === 'voided') {
    // Paid receipts (credit) void via voidPaidReceipt; paid payments (debit)
    // reverse via reversePaidPayment. Both fully unwind bank / GL / pool.
    const reverseFn =
      status === 'paid'
        ? direction === 'credit'
          ? voidPaidReceipt
          : direction === 'debit'
            ? reversePaidPayment
            : undefined
        : undefined
    const canReverse = !!reverseFn && can.void
    const confirmText = isReceipt
      ? '确认作废这张已付收据?会反冲银行、池、总账,并把发票退回未收。'
      : '确认反转这张已付付款?会退回银行、反冲总账与池子,凭证转为作废。之后可重开一张正确的。'
    const buttonLabel = isReceipt ? '作废收据 · Void receipt' : '反转付款 · Reverse payment'
    const pendingLabel = isReceipt ? '作废中…' : '反转中…'
    return (
      <div className="mt-4 grid gap-2.5">
        <p className={`${NOTE} ${status === 'paid' ? 'ok' : 'bad'}`}>
          {status === 'paid'
            ? `${isReceipt ? '已入账' : '已付款'}。银行、池、总账都已经记了。`
            : '已作废。不再算进银行、池和总账。'}
        </p>
        {result}
        {canReverse ? (
          confirmAction === 'approve' ? (
            <div className={`${NOTE} bad`}>
              <p className="mb-2.5">{confirmText}</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleAction(reverseFn!)}
                  className="deal-side-danger-solid rounded-md px-3.5 py-1.5 font-sans text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {isPending ? pendingLabel : '确认'}
                </button>
                <button type="button" onClick={() => setConfirmAction(null)} className={QUIET}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMessage(null)
                setConfirmAction('approve')
              }}
              className="deal-side-danger w-full rounded-md px-3 py-2 font-sans text-[13.5px] transition-colors"
            >
              {buttonLabel}
            </button>
          )
        ) : null}
      </div>
    )
  }

  return (
    <div className="mt-4 grid gap-2.5">
      {/* Draft: whoever raises submits it, whoever edits edits it, whoever
          voids voids it (2026-10-08, PR2 — each its own cell). Principal used
          to be blocked from Submit because no_self_approval left the card
          unapprovable (PV-0111, 2026-07-24) — mig 20260806000000 lifted that,
          so Principal may now submit and approve their own voucher. */}
      {status === 'draft' ? <p className={`${NOTE} plain`}>还是草稿，还没送批。</p> : null}
      {status === 'draft' ? (
        <>
          {can.create ? (
            <button type="button" disabled={isPending} onClick={() => handleAction(submitForApproval)} className={PRIMARY}>
              {isPending ? 'Submitting…' : 'Submit for approval'}
            </button>
          ) : null}
          {can.edit ? (
            <Link href={`/payments/${voucherId}/edit`} className={SECOND}>
              Edit
            </Link>
          ) : null}
          {can.void ? (
            <button type="button" disabled={isPending} onClick={() => handleAction(voidVoucher)} className={QUIET}>
              Void
            </button>
          ) : null}
        </>
      ) : null}

      {/* Pending: Principal can approve; Finance can void */}
      {status === 'pending_approval' ? (
        <>
          {can.approve && !confirmAction ? (
            <>
              {/* Bank balance info for Principal */}
              {isNoCashPayroll ? (
                <p className={`${NOTE} plain`}>
                  Payroll funding — books the salary expense and draws the department pools; the bank is{' '}
                  <strong>not</strong> charged now (cash leaves when staff are paid). Short pools go negative
                  (预支) — that&apos;s allowed.
                </p>
              ) : bankBalance !== null && bankName ? (
                <p className={`${NOTE} ${bankBalance < amount ? 'bad' : 'plain'}`}>
                  {bankName} balance:{' '}
                  <span className="font-mono tabular font-medium">
                    RM {bankBalance.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
                  </span>
                  {bankBalance < amount ? (
                    <> — insufficient for RM {amount.toLocaleString('en-MY', { minimumFractionDigits: 2 })} payment</>
                  ) : null}
                </p>
              ) : null}

              <button type="button" disabled={bankShortBlocks} onClick={() => setConfirmAction('approve')} className={PRIMARY}>
                {bankShortBlocks ? 'Insufficient balance' : 'Approve'}
              </button>
            </>
          ) : null}

          {can.approve && confirmAction === 'approve' ? (
            <div className={`${NOTE} plain`}>
              <h3 className="font-sans text-sm font-semibold mb-1.5">Confirm approval</h3>
              <p className="mb-3">
                Approving <strong>pays this voucher immediately</strong> — bank balance, Dept Pool, and GL journal all
                update in the same step. <strong>This cannot be undone.</strong>
              </p>
              <label className="block text-xs font-sans font-medium mb-1.5" htmlFor="approval-notes">
                Notes <span className="font-normal opacity-70">(optional)</span>
              </label>
              <textarea
                id="approval-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="deal-side-field w-full rounded-md px-3 py-2 text-sm"
                placeholder="Any context for the audit trail"
              />
              <div className="mt-3 grid gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleAction(approveVoucher, { notes })}
                  className={PRIMARY}
                >
                  {isPending ? 'Approving & paying…' : 'Approve & Pay'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmAction(null)
                    setNotes('')
                  }}
                  className={QUIET}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {!can.approve && (can.edit || can.void) ? (
            <>
              <p className={NOTE}>等 Principal 批准。批准之前还可以改，或者作废。</p>
              {can.edit ? (
                <div className={`grid gap-2 ${returnToDraft ? 'grid-cols-2' : ''}`}>
                  <Link href={`/payments/${voucherId}/edit`} className={SECOND}>
                    Edit
                  </Link>
                  {returnToDraft ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleAction(returnToDraft)}
                      className={SECOND}
                      title="单退回草稿、审批卡关掉,可重新 submit(交错账号时用)"
                    >
                      退回 Draft
                    </button>
                  ) : null}
                </div>
              ) : null}
              {can.void ? (
                <button type="button" disabled={isPending} onClick={() => handleAction(voidVoucher)} className={QUIET}>
                  Void this voucher
                </button>
              ) : null}
            </>
          ) : null}

          {/* An approver who also edits sees Edit alongside Approve, before they confirm */}
          {can.approve && can.edit && !confirmAction ? (
            <div className={`grid gap-2 ${returnToDraft ? 'grid-cols-2' : ''}`}>
              <Link href={`/payments/${voucherId}/edit`} className={SECOND}>
                Edit
              </Link>
              {returnToDraft ? (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleAction(returnToDraft)}
                  className={SECOND}
                  title="交错账号时用:单退回草稿,审批卡关掉,再用对的账号重新 submit"
                >
                  退回 Draft
                </button>
              ) : null}
            </div>
          ) : null}

          {!can.approve && !can.edit && !can.void ? <p className={NOTE}>等 Principal 批准。</p> : null}
        </>
      ) : null}

      {status === 'approved' ? <p className={`${NOTE} plain`}>已批准。</p> : null}

      {result}
    </div>
  )
}
