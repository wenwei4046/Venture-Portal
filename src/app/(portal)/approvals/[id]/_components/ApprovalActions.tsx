'use client'

import { useState, useTransition } from 'react'
import type { ApprovalRequestType } from '@/types'
import { approveRequest, rejectRequest } from '../../actions'
import { APPROVE_LEAD, REJECT_LEAD } from '../../_lib/decision-copy'

interface Props {
  approvalId: string
  requestType: ApprovalRequestType
  disableApprove?: boolean
  disableReason?: string | null
}

export default function ApprovalActions({
  approvalId,
  requestType,
  disableApprove,
  disableReason,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<'idle' | 'approving' | 'rejecting'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [allowOverdraw, setAllowOverdraw] = useState(false)

  async function handleConfirm() {
    if (mode === 'idle') return
    setError(null)

    const formData = new FormData()
    formData.append('id', approvalId)
    formData.append('notes', notes)
    if (mode === 'approving' && allowOverdraw) formData.append('allow_overdraw', 'on')

    startTransition(async () => {
      try {
        if (mode === 'approving') {
          await approveRequest(formData)
        } else {
          await rejectRequest(formData)
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) {
          throw err
        }
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })
  }

  if (mode === 'idle') {
    return (
      <div className="max-w-3xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMode('approving')}
            disabled={disableApprove}
            className="bg-accent hover:bg-accent-hover text-white font-serif italic text-base px-5 py-2.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-accent"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => setMode('rejecting')}
            className="border border-hairline text-graphite hover:text-danger hover:border-danger font-sans text-sm px-4 py-2.5 rounded-md transition-colors"
          >
            Reject
          </button>
        </div>
        {disableApprove && disableReason ? (
          <p className="mt-2 text-xs text-danger font-serif italic">
            Approve disabled: {disableReason}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="bg-surface border border-hairline rounded-md p-6 max-w-3xl">
      <h3 className="font-serif text-lg text-ink mb-2">
        {mode === 'approving' ? 'Confirm approval' : 'Reject with reason'}
      </h3>
      <p className="font-serif italic text-graphite text-sm mb-4">
        {mode === 'approving' ? (
          <>
            {APPROVE_LEAD[requestType]} and records your decision in the audit
            trail. <em>This cannot be undone.</em>
          </>
        ) : (
          <>
            {REJECT_LEAD[requestType]}. A written reason is <em>required</em>.
          </>
        )}
      </p>

      <div className="mb-4">
        <label
          htmlFor="notes"
          className="block text-sm font-sans font-medium text-graphite mb-1.5"
        >
          {mode === 'approving' ? (
            <>
              Notes <span className="text-muted font-normal">(optional)</span>
            </>
          ) : (
            <>Reason (required)</>
          )}
        </label>
        <textarea
          id="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          required={mode === 'rejecting'}
          className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
          placeholder={
            mode === 'approving'
              ? 'Any context for the audit trail'
              : 'Why is this being rejected?'
          }
        />
      </div>

      {mode === 'approving' && requestType === 'payment_voucher' ? (
        <label className="flex items-start gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={allowOverdraw}
            onChange={(e) => setAllowOverdraw(e.target.checked)}
            className="h-4 w-4 mt-0.5 accent-[var(--accent)]"
          />
          <span className="text-sm font-sans text-graphite">
            允许部门池透支 · Allow dept-pool overdraw
            <span className="block text-xs text-muted font-serif italic mt-0.5">
              勾选后,即使某个部门池余额不够,也照样放行(池子会变负数 = 该部门暂由 Venture 垫)。用于不能拖的薪资等。
            </span>
          </span>
        </label>
      ) : null}

      {error ? (
        <div className="bg-danger-bg border border-danger text-danger rounded-md p-3 mb-4 text-sm font-sans">
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isPending || (mode === 'rejecting' && !notes.trim())}
          className={
            mode === 'approving'
              ? 'bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-5 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
              : 'bg-danger hover:opacity-90 text-white font-serif italic text-sm px-5 py-2 rounded-md transition-opacity disabled:opacity-50 disabled:cursor-not-allowed'
          }
        >
          {isPending
            ? 'Submitting…'
            : mode === 'approving'
              ? 'Yes, approve'
              : 'Yes, reject'}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('idle')
            setNotes('')
            setError(null)
            setAllowOverdraw(false)
          }}
          className="text-sm text-graphite hover:text-ink font-sans transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
