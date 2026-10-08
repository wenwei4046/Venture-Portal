'use client'

import { useState, useTransition } from 'react'
import { officeTime } from '@/lib/office-time'
import { formatMoney } from '@/lib/utils'
import { approveRequestGroup, rejectRequestGroup } from '../actions'
import BatchDetailsModal from './BatchDetailsModal'

interface GroupItem {
  request_type: string
  description: string | null
  amount: number | null
  reference_id: string | null
  reference_table: string | null
}

// Self-approval allowed (user 2026-08-06: "principal submit 要自己能approve")
// — the old isSelfSubmitted prop and its blocking banner are gone.
interface Props {
  groupId: string
  items: GroupItem[]
  submitterName: string
  createdAt: string
  /** Multi-select membership (user 2026-08-06: select-all covers combined
   *  cards too). When provided, the header grows a checkbox and the card can
   *  ride the bulk Approve N selected sweep. */
  selected?: boolean
  onToggleSelect?: () => void
}

export default function CombinedApprovalCard({
  groupId,
  items,
  submitterName,
  createdAt,
  selected = false,
  onToggleSelect,
}: Props) {
  const [showReject, setShowReject] = useState(false)
  const [rejectNotes, setRejectNotes] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)

  const voucherItems = items.filter((i) => i.request_type === 'payment_voucher')
  // Non-voucher members (e.g. the new_loan in a Loan OUT combo). Their presence
  // means this group cannot be split per-row — approve_voucher_batch_partial
  // rejects any group containing non-payment_voucher items, so the per-row
  // modal would error on submit. Those groups get a read-only "View details"
  // modal instead; the actual approval runs through the card's "Approve both".
  const contextItems = items.filter((i) => i.request_type !== 'payment_voucher')
  const hasVouchers = voucherItems.length > 0
  const hasNonVoucher = contextItems.length > 0

  // Total disbursement = actual cash out = sum of the payment_voucher amounts.
  // In a Loan OUT combo the new_loan principal equals its disbursement voucher
  // (the same money), so summing EVERY item double-counted it (RM 111k shown
  // for a RM 55k loan). Payroll batches have no loan, so this still sums all of
  // their vouchers. Fall back to all items only if a group has no voucher.
  const total = (hasVouchers ? voucherItems : items).reduce(
    (s, i) => s + Number(i.amount ?? 0),
    0,
  )
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
      className={`border rounded-md bg-surface p-5 shadow-sm transition-colors ${
        selected ? 'border-accent/70 bg-accent/[0.04]' : 'border-accent/40'
      }`}
    >
      {/* Header */}
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-2">
          {onToggleSelect ? (
            <label
              className="flex items-center cursor-pointer pr-1"
              title="Select for bulk approval"
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={onToggleSelect}
                className="h-4 w-4 accent-[var(--accent)]"
              />
            </label>
          ) : null}
          <span className="text-xs font-sans font-semibold uppercase tracking-wider text-accent">
            COMBINED APPROVAL
          </span>
          <span className="text-xs font-sans text-muted">
            · {items.length} linked requests
          </span>
        </div>
        <div className="font-mono text-xs text-muted">
          {officeTime(createdAt).format('D MMM HH:mm')}
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

      {/* Total + details trigger */}
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
          {hasVouchers ? (
            <button
              type="button"
              onClick={() => setShowDetails(true)}
              className="mt-1 text-xs font-serif italic text-accent hover:text-accent-hover"
            >
              {hasNonVoucher ? 'View details →' : 'Review per row →'}
            </button>
          ) : null}
        </div>
      </div>

      {hasVouchers ? (
        <BatchDetailsModal
          groupId={groupId}
          open={showDetails}
          onClose={() => setShowDetails(false)}
          actionable={!hasNonVoucher}
          contextItems={contextItems}
        />
      ) : null}

      {/* Actions */}
      {showReject ? (
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
    dept_payment_request: 'Dept Request Payment',
  }
  return labels[type] ?? type.toUpperCase()
}
