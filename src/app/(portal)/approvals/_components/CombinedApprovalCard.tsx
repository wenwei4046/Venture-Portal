'use client'

import { useState, useTransition } from 'react'
import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'
import { approveRequestGroup, rejectRequestGroup } from '../actions'

interface GroupItem {
  request_type: string
  description: string | null
  amount: number | null
  reference_id: string | null
  reference_table: string | null
}

interface Props {
  groupId: string
  items: GroupItem[]
  submitterName: string
  createdAt: string
  isSelfSubmitted: boolean
}

export default function CombinedApprovalCard({
  groupId,
  items,
  submitterName,
  createdAt,
  isSelfSubmitted,
}: Props) {
  const [showReject, setShowReject] = useState(false)
  const [rejectNotes, setRejectNotes] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Sum every item's amount — handles both the 2-item Loan OUT combo and
  // N-voucher payroll disbursement batches. Previously we did
  // items.find(payment_voucher) which only surfaced the first voucher's
  // amount, so 32-voucher batches displayed RM <one-voucher> as the total.
  const total = items.reduce((s, i) => s + Number(i.amount ?? 0), 0)
  const approveLabel =
    items.length === 2 ? 'Approve both' : `Approve all ${items.length}`
  const approvingLabel =
    items.length === 2 ? 'Approving…' : `Approving all ${items.length}…`

  const handleApprove = () => {
    setError(null)
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('group_id', groupId)
        await approveRequestGroup(fd)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Approval failed')
      }
    })
  }

  const handleReject = () => {
    if (!rejectNotes.trim()) {
      setError('Please provide a rejection reason.')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        const fd = new FormData()
        fd.set('group_id', groupId)
        fd.set('notes', rejectNotes.trim())
        await rejectRequestGroup(fd)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Rejection failed')
      }
    })
  }

  return (
    <div
      data-testid="combined-approval-card"
      data-group-id={groupId}
      className="border border-accent/40 rounded-md bg-surface p-5 shadow-sm"
    >
      {/* Header */}
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-sans font-semibold uppercase tracking-wider text-accent">
            COMBINED APPROVAL
          </span>
          <span className="text-xs font-sans text-muted">
            · {items.length} linked requests
          </span>
        </div>
        <div className="font-mono text-xs text-muted">
          {dayjs(createdAt).format('D MMM HH:mm')}
        </div>
      </div>

      {/* Items */}
      <ul className="space-y-2 mb-5 border-l-2 border-accent/30 pl-4">
        {items.map((item, idx) => (
          <li key={idx}>
            <div className="text-[11px] font-sans font-semibold uppercase tracking-wider text-graphite">
              {formatRequestType(item.request_type)}
            </div>
            <div className="font-serif text-md text-ink">
              {item.description ?? 'No description'}
            </div>
          </li>
        ))}
      </ul>

      {/* Total */}
      <div className="flex items-baseline justify-between border-t border-hairline pt-3 mb-5">
        <div>
          <div className="text-xs font-sans text-muted">Total disbursement</div>
          <div className="font-mono tabular text-xl font-medium text-ink">
            {formatMoney(total)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted font-sans">
            Submitted by{' '}
            <span className="font-serif italic text-graphite">
              {submitterName}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      {isSelfSubmitted ? (
        <div className="bg-alert-bg border border-alert rounded-md p-3">
          <p className="font-serif italic text-alert text-sm">
            You submitted this request and cannot approve your own submission.
          </p>
        </div>
      ) : showReject ? (
        <div className="space-y-3">
          <textarea
            aria-label="Rejection reason"
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder="Rejection reason (required)"
            className="w-full border border-hairline rounded-md px-3 py-2 text-sm font-serif"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReject}
              disabled={isPending}
              className="px-4 py-2 bg-danger text-white text-sm font-serif italic rounded-md hover:bg-danger/90 disabled:opacity-50"
            >
              {isPending ? 'Rejecting…' : 'Confirm reject'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowReject(false)
                setRejectNotes('')
                setError(null)
              }}
              disabled={isPending}
              className="px-4 py-2 border border-hairline text-sm font-serif italic rounded-md hover:bg-surface-2/40"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="combined-approve-btn"
            onClick={handleApprove}
            disabled={isPending}
            className="px-4 py-2 bg-accent text-white text-sm font-serif italic rounded-md hover:bg-accent-hover disabled:opacity-50"
          >
            {isPending ? approvingLabel : approveLabel}
          </button>
          <button
            type="button"
            data-testid="combined-reject-btn"
            onClick={() => setShowReject(true)}
            disabled={isPending}
            className="px-4 py-2 border border-hairline text-sm font-serif italic rounded-md hover:bg-surface-2/40"
          >
            Reject
          </button>
        </div>
      )}

      {error ? (
        <div className="mt-3 text-sm text-danger font-serif italic">{error}</div>
      ) : null}
    </div>
  )
}

function formatRequestType(type: string): string {
  const labels: Record<string, string> = {
    new_loan: 'New loan',
    payment_voucher: 'Payment voucher',
  }
  return labels[type] ?? type.toUpperCase()
}
