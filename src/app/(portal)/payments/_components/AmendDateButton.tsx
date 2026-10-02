'use client'

// In-place DATE fix for something already posted (user 2026-10-02: "这个日期我
// 录错了怎么办？能自己改吗？"). The companion of AmendRepaymentButton: one RPC moves
// the record and its GL entries to the right day and leaves a note on both; the
// amount, the bank and the pools are not touched. Until this existed the only
// remedy was to void and record again — and a receipt, which is paid the moment
// it is made, took a new number each time.
//
//   kind 'voucher'    a paid receipt / payment voucher  → amend_voucher_date
//   kind 'repayment'  a loan repayment received direct  → amend_loan_repayment_date
//
// The RPC refuses a closed month, a future date, a payroll voucher, and anything
// already matched in a bank reconciliation; whatever it says is shown as it is.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { backdropDismiss } from '@/components/modal-dismiss'
import { officeDate } from '@/lib/office-clock'
import { amendVoucherDate } from '../actions'
import { amendRepaymentDate } from '../../fund-out/actions'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "2026-10-01" → "1 Oct 2026". Built from the parts, so no zone can move it. */
function plainDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '—'
}

export default function AmendDateButton({
  kind,
  id,
  currentDate,
  label,
  autoOpen = false,
  hideTrigger = false,
  triggerClassName = 'ml-2 text-xs text-muted hover:text-accent font-serif italic',
}: {
  kind: 'voucher' | 'repayment'
  /** The voucher's id, or the repayment's (without the list's 'rpy-' prefix). */
  id: string
  /** YYYY-MM-DD as recorded now. */
  currentDate: string
  /** What is being re-dated, for the dialog's heading: a number, or a name. */
  label: string
  /** Opened from a row menu: the dialog starts open, and no trigger is drawn. */
  autoOpen?: boolean
  hideTrigger?: boolean
  triggerClassName?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(autoOpen)
  const [date, setDate] = useState(currentDate)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const today = officeDate()

  function submit() {
    setError(null)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('选一个日期')
    if (date === currentDate) return setError('日期没有变')
    if (date > today) return setError('不能填未来的日期')
    if (!reason.trim()) return setError('写一句原因(会留在记录里)')
    const fd = new FormData()
    fd.set('id', id)
    fd.set('new_date', date)
    fd.set('reason', reason.trim())
    startTransition(async () => {
      const res = kind === 'voucher' ? await amendVoucherDate(fd) : await amendRepaymentDate(fd)
      if (res.error) {
        setError(res.error)
        return
      }
      setDone(`改好了 — ${plainDate(res.old)} → ${plainDate(res.newDate)},总账已经跟着改。`)
      router.refresh()
    })
  }

  return (
    <>
      {hideTrigger ? null : (
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            setDone(null)
            setError(null)
            setDate(currentDate)
          }}
          className={triggerClassName}
          title="日期录错用这个:直接改这笔的日期,总账的分录一起改并留注记"
        >
          改日期
        </button>
      )}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/45 p-4"
          {...backdropDismiss(() => !isPending && setOpen(false))}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="改日期"
            className="bg-paper border border-hairline rounded-panel shadow-xl w-full max-w-md text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-hairline">
              <div className="font-serif italic text-accent text-sm">Amend date</div>
              <div className="font-serif text-lg text-ink">改日期 — {label}</div>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <div className="text-sm font-sans font-medium text-graphite mb-1.5">现在的日期</div>
                <div className="px-3 py-2 bg-surface border border-hairline rounded-md text-sm text-graphite font-mono tabular">
                  {plainDate(currentDate)}
                </div>
              </div>
              <div>
                <label htmlFor="amend-date-new" className="block text-sm font-sans font-medium text-graphite mb-1.5">
                  对的日期 <span className="text-danger">*</span>
                </label>
                <input
                  id="amend-date-new"
                  type="date"
                  value={date}
                  max={today}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink font-mono tabular focus:outline-none focus:border-accent-border"
                />
              </div>
              <div>
                <label htmlFor="amend-date-reason" className="block text-sm font-sans font-medium text-graphite mb-1.5">
                  原因 <span className="text-danger">*</span>
                </label>
                <input
                  id="amend-date-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. 录错一天"
                  className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
                />
              </div>
              <p className="bg-accent-bg border border-accent-border rounded-md px-3 py-2 text-xs font-sans text-graphite leading-relaxed">
                会一起改的:这笔记录,和它在总账的分录。不会动的:金额、银行、池。
                那个月已经关账、或这笔已经对过银行账,就不让改。
              </p>
              {error ? (
                <div role="alert" className="bg-danger/10 border border-danger/30 text-danger rounded-md px-3 py-2 text-sm font-sans">
                  {error}
                </div>
              ) : null}
              {done ? (
                <div role="status" className="bg-surface border border-hairline rounded-md px-3 py-2 text-sm font-sans text-ledger">
                  {done}
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-hairline bg-surface rounded-b-lg">
              <button
                type="button"
                onClick={() => !isPending && setOpen(false)}
                disabled={isPending}
                className="text-sm font-sans text-muted hover:text-ink disabled:opacity-50"
              >
                {done ? 'Close' : 'Cancel'}
              </button>
              {!done ? (
                <button
                  type="button"
                  onClick={submit}
                  disabled={isPending}
                  className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50"
                >
                  {isPending ? '改着…' : '确认改'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
