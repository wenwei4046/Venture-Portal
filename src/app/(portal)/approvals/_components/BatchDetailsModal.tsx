'use client'

import { useEffect, useState, useTransition } from 'react'
import { formatMoney } from '@/lib/utils'
import {
  getBatchVoucherDetails,
  type BatchVoucherRow,
} from '../actions'
import AttachmentList from '@/components/voucher/AttachmentList'

interface Props {
  groupId: string
  open: boolean
  onClose: () => void
}

export default function BatchDetailsModal({ groupId, open, onClose }: Props) {
  const [rows, setRows] = useState<BatchVoucherRow[] | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open || rows !== null) return
    setError(null)
    startTransition(async () => {
      try {
        const data = await getBatchVoucherDetails(groupId)
        setRows(data)
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

  if (!open) return null

  const attachmentSummary = rows
    ? `${rows.filter((r) => r.attachments.length > 0).length} of ${rows.length} have attachments`
    : null

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
            <h2 className="font-serif text-xl text-ink">Batch voucher details</h2>
            {attachmentSummary ? (
              <p className="font-mono text-xs text-muted mt-1">{attachmentSummary}</p>
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

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isPending && rows === null ? (
            <p className="font-serif italic text-muted text-sm py-8 text-center">
              Loading voucher details…
            </p>
          ) : error ? (
            <p className="font-serif italic text-danger text-sm py-4">{error}</p>
          ) : rows && rows.length > 0 ? (
            <ul className="divide-y divide-hairline">
              {rows.map((r) => {
                const isOpen = expanded === r.voucherId
                return (
                  <li key={r.voucherId} className="py-3">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : r.voucherId)}
                      className="w-full text-left flex items-baseline justify-between gap-3 hover:bg-surface-2/40 rounded-md px-2 py-1 -mx-2"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-muted">
                          {r.voucherNo ?? 'Draft'}
                        </div>
                        <div className="font-serif text-sm text-ink truncate">
                          {r.payeeName} · {r.description}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono tabular text-sm text-ink">
                          {formatMoney(r.amount)}
                        </div>
                        <div className="font-mono text-[10px] text-muted">
                          {r.attachments.length}{' '}
                          attachment{r.attachments.length === 1 ? '' : 's'}
                        </div>
                      </div>
                    </button>

                    {isOpen ? (
                      <div className="mt-3 ml-2 pl-3 border-l-2 border-accent/30 space-y-3">
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
      </div>
    </div>
  )
}
