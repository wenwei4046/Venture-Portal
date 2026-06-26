'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import {
  getBatchVoucherDetails,
  approveRequestGroupPartial,
  type BatchVoucherRow,
} from '../actions'
import AttachmentList from '@/components/voucher/AttachmentList'

interface ContextItem {
  request_type: string
  description: string | null
  amount: number | null
}

interface Props {
  groupId: string
  open: boolean
  onClose: () => void
  // P1-1: when actionable=true the modal renders checkboxes and the
  // Approve selected / Reject rest button. When false (viewer mode) it
  // stays purely informational.
  actionable?: boolean
  // Non-voucher members of the group (e.g. the new_loan in a Loan OUT combo).
  // Shown read-only at the top so the modal reflects every linked request, not
  // just the vouchers — the per-row voucher fetch only returns vouchers.
  contextItems?: ContextItem[]
}

function contextLabel(type: string): string {
  const labels: Record<string, string> = {
    new_loan: 'New loan',
    dept_payment_request: 'Dept Request Payment',
  }
  return labels[type] ?? type.replace(/_/g, ' ')
}

export default function BatchDetailsModal({
  groupId,
  open,
  onClose,
  actionable = false,
  contextItems = [],
}: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<BatchVoucherRow[] | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, startLoading] = useTransition()
  const [isSubmitting, startSubmitting] = useTransition()

  // P1-1: approved set (approvalId). Default = everyone approved.
  const [approvedSet, setApprovedSet] = useState<Set<string>>(new Set())
  const [rejectReason, setRejectReason] = useState('')
  const [approveNotes, setApproveNotes] = useState('')

  useEffect(() => {
    if (!open || rows !== null) return
    setError(null)
    startLoading(async () => {
      try {
        const data = await getBatchVoucherDetails(groupId)
        setRows(data)
        setApprovedSet(new Set(data.map((r) => r.approvalId)))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load batch details')
      }
    })
  }, [open, rows, groupId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const approveIds = useMemo(() => Array.from(approvedSet), [approvedSet])
  const rejectIds = useMemo(() => {
    if (!rows) return [] as string[]
    return rows.filter((r) => !approvedSet.has(r.approvalId)).map((r) => r.approvalId)
  }, [rows, approvedSet])
  const allApproved = rows ? rejectIds.length === 0 : false
  const noneApproved = rows ? approveIds.length === 0 : false
  const hasReject = rejectIds.length > 0
  const submittable = actionable && rows && !noneApproved
    ? (hasReject ? rejectReason.trim().length > 0 : true)
    : actionable && rows && noneApproved
      ? rejectReason.trim().length > 0
      : false

  function toggle(approvalId: string) {
    setApprovedSet((prev) => {
      const next = new Set(prev)
      if (next.has(approvalId)) next.delete(approvalId)
      else next.add(approvalId)
      return next
    })
  }

  function allOn() {
    if (!rows) return
    setApprovedSet(new Set(rows.map((r) => r.approvalId)))
  }
  function allOff() {
    setApprovedSet(new Set())
  }

  function handleSubmit() {
    if (!rows) return
    setError(null)
    startSubmitting(async () => {
      try {
        await approveRequestGroupPartial({
          groupId,
          approveApprovalIds: approveIds,
          rejectApprovalIds: rejectIds,
          approveNotes,
          rejectReason,
        })
        onClose()
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to submit decisions')
      }
    })
  }

  if (!open) return null

  const submitLabel =
    !rows
      ? 'Decide'
      : noneApproved
        ? `Reject all ${rejectIds.length}`
        : hasReject
          ? `Approve ${approveIds.length}, reject ${rejectIds.length}`
          : `Approve all ${approveIds.length}`

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-paper border border-hairline rounded-lg shadow-xl max-w-3xl w-[92vw] max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-hairline flex items-baseline justify-between">
          <div>
            <h2 className="font-serif text-xl text-ink">
              {actionable ? 'Review batch — approve or reject per row' : 'Batch voucher details'}
            </h2>
            {rows ? (
              <p className="font-mono text-xs text-muted mt-1">
                {actionable
                  ? `${approveIds.length} approved · ${rejectIds.length} rejected · ${rows.length} total`
                  : `${rows.filter((r) => r.attachments.length > 0).length} of ${rows.length} have attachments`}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-ink font-serif italic text-sm"
          >
            Close ✕
          </button>
        </div>

        {actionable && rows && rows.length > 1 ? (
          <div className="px-6 py-2 border-b border-hairline flex items-center gap-3 text-xs font-sans">
            <span className="text-muted">Quick select:</span>
            <button
              type="button"
              onClick={allOn}
              className="text-accent hover:text-accent-hover font-serif italic"
            >
              Approve all
            </button>
            <span className="text-muted">·</span>
            <button
              type="button"
              onClick={allOff}
              className="text-danger hover:text-danger/80 font-serif italic"
            >
              Reject all
            </button>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {contextItems.length > 0 ? (
            <div className="mb-4 rounded-md border border-hairline bg-surface-2/40 px-3 py-2">
              <div className="text-[11px] font-sans font-semibold uppercase tracking-wider text-graphite mb-1">
                Also in this batch · approved together via “Approve both”
              </div>
              <ul className="space-y-1">
                {contextItems.map((c, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3">
                    <span className="font-serif text-sm text-ink truncate min-w-0">
                      <span className="font-mono text-xs text-muted mr-2">
                        {contextLabel(c.request_type)}
                      </span>
                      {c.description ?? 'No description'}
                    </span>
                    {c.amount != null ? (
                      <span className="font-mono tabular text-sm text-ink shrink-0">
                        {formatMoney(c.amount)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {isLoading && rows === null ? (
            <p className="font-serif italic text-muted text-sm py-8 text-center">
              Loading voucher details…
            </p>
          ) : error ? (
            <p className="font-serif italic text-danger text-sm py-4">{error}</p>
          ) : rows && rows.length > 0 ? (
            <ul className="divide-y divide-hairline">
              {rows.map((r) => {
                const isOpen = expanded === r.voucherId
                const isApproved = approvedSet.has(r.approvalId)
                return (
                  <li key={r.voucherId} className="py-3">
                    <div className="flex items-start gap-3">
                      {actionable ? (
                        <label className="mt-1 flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isApproved}
                            onChange={() => toggle(r.approvalId)}
                            className="h-4 w-4 accent-accent cursor-pointer"
                            aria-label={`Approve ${r.voucherNo ?? r.voucherId}`}
                          />
                        </label>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : r.voucherId)}
                        className="flex-1 text-left flex items-baseline justify-between gap-3 hover:bg-surface-2/40 rounded-md px-2 py-1 -mx-2"
                      >
                        <div className="min-w-0">
                          <div className="font-mono text-xs text-muted">
                            {r.voucherNo ?? 'Draft'}
                            {actionable && !isApproved ? (
                              <span className="ml-2 text-danger font-serif italic not-mono">
                                · will be rejected
                              </span>
                            ) : null}
                          </div>
                          <div className="font-serif text-sm text-ink truncate">
                            {r.payeeName} · {r.description}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div
                            className={
                              actionable && !isApproved
                                ? 'font-mono tabular text-sm text-muted line-through'
                                : 'font-mono tabular text-sm text-ink'
                            }
                          >
                            {formatMoney(r.amount)}
                          </div>
                          <div className="font-mono text-[10px] text-muted">
                            {r.attachments.length}{' '}
                            attachment{r.attachments.length === 1 ? '' : 's'}
                          </div>
                        </div>
                      </button>
                    </div>

                    {isOpen ? (
                      <div className="mt-3 ml-7 pl-3 border-l-2 border-accent/30 space-y-3">
                        {r.sources.length > 0 ? (
                          <div>
                            <div className="text-[11px] font-sans font-semibold uppercase tracking-wider text-graphite mb-1">
                              Source pools
                            </div>
                            <ul className="text-sm font-mono text-ink space-y-0.5">
                              {r.sources.map((s, i) => (
                                <li key={i}>
                                  {s.pool.replace(/_/g, ' ')} · {formatMoney(s.amount)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        <div>
                          <div className="text-[11px] font-sans font-semibold uppercase tracking-wider text-graphite mb-1">
                            Attachments
                          </div>
                          <AttachmentList
                            attachments={r.attachments.map((a) => ({
                              id: a.id,
                              file_name: a.fileName,
                              file_type: a.fileType,
                              uploaded_at: a.uploadedAt,
                            }))}
                            emptyMessage="No attachments on this voucher."
                          />
                        </div>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="font-serif italic text-muted text-sm py-8 text-center">
              No vouchers in this batch.
            </p>
          )}
        </div>

        {actionable && rows && rows.length > 0 ? (
          <div className="border-t border-hairline bg-surface px-6 py-4 space-y-3">
            {hasReject ? (
              <div>
                <label className="block text-xs font-sans font-semibold uppercase tracking-wider text-graphite mb-1">
                  Rejection reason <span className="text-danger">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={2}
                  placeholder="Why are these rows being rejected? (shown to submitter)"
                  className="w-full border border-hairline rounded-md px-3 py-2 text-sm font-serif bg-paper"
                />
              </div>
            ) : null}
            {approveIds.length > 0 ? (
              <div>
                <label className="block text-xs font-sans font-semibold uppercase tracking-wider text-graphite mb-1">
                  Approval notes <em className="text-muted text-[10px] normal-case">optional</em>
                </label>
                <input
                  type="text"
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                  placeholder="Notes attached to approved rows"
                  className="w-full border border-hairline rounded-md px-3 py-2 text-sm font-serif bg-paper"
                />
              </div>
            ) : null}

            {error ? (
              <div className="text-sm text-danger font-serif italic">{error}</div>
            ) : null}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!submittable || isSubmitting}
                className={
                  allApproved
                    ? 'px-4 py-2 bg-accent text-white text-sm font-serif italic rounded-md hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed'
                    : noneApproved
                      ? 'px-4 py-2 bg-danger text-white text-sm font-serif italic rounded-md hover:bg-danger/90 disabled:opacity-50 disabled:cursor-not-allowed'
                      : 'px-4 py-2 bg-accent text-white text-sm font-serif italic rounded-md hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed'
                }
              >
                {isSubmitting ? 'Submitting…' : submitLabel}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 border border-hairline text-sm font-serif italic rounded-md hover:bg-surface-2/40"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
