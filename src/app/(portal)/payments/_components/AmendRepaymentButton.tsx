'use client'

// In-place amount fix for a received loan repayment row on the /receipts
// ledger (user 2026-09-03: "不能直接点开receipt 的单去edit?"). The RPC
// adjusts the repayment, its GL entry, the bank cache and (for principal)
// venture_pool + loan status atomically; ambiguous records error out and
// the loan page's 撤销 + re-record path applies instead.

import { useState, useTransition } from 'react'
import { backdropDismiss } from '@/components/modal-dismiss'
import { useRouter } from 'next/navigation'
import { useFinView } from '@/components/layout/fin-view'
import { amendRepayment } from '../../fund-out/actions'

// In English on the Finance view (2026-10-10, the handoff — Receipt's row menu
// already says "Change amount").
const WORDS = {
  zh: {
    trigger: '改金额',
    triggerTitle: '金额录错用这个:直接改这笔还款的金额,GL/银行/池自动同步并留注记',
    title: '改这笔还款的金额',
    intro: (label: string, now: string) =>
      `${label} · 现在 RM ${now}。 改完 GL 分录、银行余额(和本金的池记录)自动跟着调,全部留注记。 整笔录错要重来的话,去贷款页用「撤销」再重录。`,
    correct: '正确金额',
    reason: '原因',
    reasonHint: 'e.g. 利息录错',
    notPositive: '金额必须大于 0',
    same: '金额没有改变',
    noReason: '写一句原因(会记进 GL 的审计注记)',
    done: (from: string, to: string) => `改好了 — ${from} → ${to},GL/银行已同步。`,
    saving: '改着…',
    confirm: '确认改',
  },
  en: {
    trigger: 'Change amount',
    triggerTitle: 'For an amount keyed wrong: changes this repayment’s amount — the GL, bank and pool follow, each with a note',
    title: 'Change this repayment’s amount',
    intro: (label: string, now: string) =>
      `${label} · now RM ${now}. The GL entries and the bank balance (and the principal’s pool record) follow, each with a note. To redo the whole repayment, undo it on the loan’s page and record it again.`,
    correct: 'Correct amount',
    reason: 'Reason',
    reasonHint: 'e.g. interest keyed wrong',
    notPositive: 'The amount must be more than 0',
    same: 'The amount has not changed',
    noReason: 'Write a reason (it goes into the GL’s audit note)',
    done: (from: string, to: string) => `Changed — ${from} → ${to}; GL and bank updated.`,
    saving: 'Changing…',
    confirm: 'Confirm change',
  },
}

export default function AmendRepaymentButton({
  repaymentId,
  currentAmount,
  label,
  autoOpen = false,
  hideTrigger = false,
}: {
  /** Opened from the row's menu (2026-10-02): the dialog starts open and the
   *  component draws no trigger of its own. */
  autoOpen?: boolean
  hideTrigger?: boolean
  repaymentId: string
  currentAmount: number
  label: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(autoOpen)
  const [amount, setAmount] = useState(currentAmount.toFixed(2))
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const w = useFinView() ? WORDS.en : WORDS.zh

  function submit() {
    setError(null)
    const n = parseFloat(amount)
    if (!Number.isFinite(n) || n <= 0) return setError(w.notPositive)
    if (Math.abs(n - currentAmount) < 0.005) return setError(w.same)
    if (!reason.trim()) return setError(w.noReason)
    const fd = new FormData()
    fd.set('repayment_id', repaymentId)
    fd.set('new_amount', amount)
    fd.set('reason', reason.trim())
    startTransition(async () => {
      const res = await amendRepayment(fd)
      if (res.error) {
        setError(res.error)
        return
      }
      setDone(w.done(`${res.old?.toFixed(2)}`, `${res.newAmount?.toFixed(2)}`))
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
            setAmount(currentAmount.toFixed(2))
          }}
          className="ml-2 text-xs text-muted hover:text-accent font-serif italic"
          title={w.triggerTitle}
        >
          {w.trigger}
        </button>
      )}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/45 p-4" {...backdropDismiss(() => !isPending && setOpen(false))}>
          <div className="bg-paper border border-hairline rounded-panel shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-hairline">
              <div className="font-serif italic text-accent text-sm">Amend repayment</div>
              <div className="font-serif text-lg text-ink">{w.title}</div>
              <p className="font-serif italic text-muted text-xs mt-1">
                {w.intro(label, currentAmount.toLocaleString('en-MY', { minimumFractionDigits: 2 }))}
              </p>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
                  {w.correct} <span className="text-danger">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink font-mono tabular focus:outline-none focus:border-accent-border"
                />
              </div>
              <div>
                <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
                  {w.reason} <span className="text-danger">*</span>
                </label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={w.reasonHint}
                  className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink placeholder:text-muted focus:outline-none focus:border-accent-border"
                />
              </div>
              {error ? (
                <div className="bg-danger/10 border border-danger/30 text-danger rounded-md px-3 py-2 text-sm font-sans">{error}</div>
              ) : null}
              {done ? (
                <div className="bg-surface border border-hairline rounded-md px-3 py-2 text-sm font-sans text-ledger">{done}</div>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-hairline bg-surface rounded-b-lg">
              <button
                onClick={() => !isPending && setOpen(false)}
                disabled={isPending}
                className="text-sm font-sans text-muted hover:text-ink disabled:opacity-50"
              >
                {done ? 'Close' : 'Cancel'}
              </button>
              {!done ? (
                <button
                  onClick={submit}
                  disabled={isPending}
                  className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50"
                >
                  {isPending ? w.saving : w.confirm}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
