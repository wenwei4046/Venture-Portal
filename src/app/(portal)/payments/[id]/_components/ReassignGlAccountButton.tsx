'use client'

// Change the GL account of an APPROVED/PAID voucher (user 2026-08-24:
// "gl account 放错，我希望approve 了我还能改"). Renders next to the sources
// table for finance/principal; the server RPC edits the posted journal lines
// in place and stamps an audit note on the entries.

import { useState, useTransition } from 'react'
import { backdropDismiss } from '@/components/modal-dismiss'
import { useRouter } from 'next/navigation'
import { useFinView } from '@/components/layout/fin-view'
import { DialogButton, DialogForm, Field, FinDialog, Hint, Input } from '@/components/finv/Dialog'
import fm from '@/components/finv/form.module.css'
import { useFinSurface } from '@/components/finv/surface'
import { Select } from '@/components/hrv/select'
import { reassignVoucherGlAccount } from '../../actions'

interface FromOption {
  code: string
  name: string
  total: number
}

interface AccountOption {
  code: string
  name: string
}

// In English on the Finance view (2026-10-10, the handoff: the voucher page is
// English throughout).
const WORDS = {
  zh: {
    trigger: '改 GL account',
    triggerTitle: 'Approve/paid 之后改错科目用这个:直接把已过账的 GL 行移去对的 account,自动留审计注记',
    title: '改这张 voucher 的 GL account',
    intro: '同一笔分录、同金额同日期,只把科目移过去 — P&L / Cash Flow / TB 一起更新,GL 上会留下改动注记。',
    from: '现在的 account(放错的)',
    to: '改去(对的 account)',
    reason: '原因',
    reasonHint: 'e.g. 录入时选错科目',
    pickFrom: '选一个要改的 account',
    pickTo: '选新的 account',
    same: '新旧 account 一样',
    noReason: '写一句原因(会记进 GL 的审计注记)',
    done: (n: number, from: string, to: string) => `改好了 — ${n} 条 GL 行已从 ${from} 移去 ${to}。`,
    saving: '改着…',
    confirm: '确认改',
  },
  en: {
    trigger: 'Change GL account',
    triggerTitle: 'For an account picked wrong after approval: moves the posted GL lines to the right account and leaves an audit note',
    title: 'Change this voucher’s GL account',
    intro: 'Same entry, same amount and date — only the account moves. P&L, Cash Flow and TB update with it, and the GL keeps a note of the change.',
    from: 'Account now (the wrong one)',
    to: 'Move to (the right account)',
    reason: 'Reason',
    reasonHint: 'e.g. picked the wrong account',
    pickFrom: 'Pick the account to change',
    pickTo: 'Pick the new account',
    same: 'The two accounts are the same',
    noReason: 'Write a reason (it goes into the GL’s audit note)',
    done: (n: number, from: string, to: string) => `Changed — ${n} GL ${n === 1 ? 'line' : 'lines'} moved from ${from} to ${to}.`,
    saving: 'Changing…',
    confirm: 'Confirm change',
  },
}

export default function ReassignGlAccountButton({
  voucherId,
  fromOptions,
  accountOptions,
  autoOpen = false,
  hideTrigger = false,
}: {
  voucherId: string
  fromOptions: FromOption[]
  accountOptions: AccountOption[]
  /** Opened from a menu (the phone app's ⋯): the window starts open, and no trigger is drawn. */
  autoOpen?: boolean
  hideTrigger?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(autoOpen)
  // In the Finance phone app the window is the kit's, rising as a sheet (2026-10-15).
  const sheet = useFinSurface() !== null
  const [oldAccount, setOldAccount] = useState(fromOptions.length === 1 ? fromOptions[0].code : '')
  const [newAccount, setNewAccount] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const w = useFinView() ? WORDS.en : WORDS.zh

  function submit() {
    setError(null)
    if (!oldAccount) return setError(w.pickFrom)
    if (!newAccount) return setError(w.pickTo)
    if (newAccount === oldAccount) return setError(w.same)
    if (!reason.trim()) return setError(w.noReason)
    const fd = new FormData()
    fd.set('id', voucherId)
    fd.set('old_account', oldAccount)
    fd.set('new_account', newAccount)
    fd.set('reason', reason.trim())
    startTransition(async () => {
      const res = await reassignVoucherGlAccount(fd)
      if (res.error) {
        setError(res.error)
        return
      }
      setDone(w.done(res.changed ?? 0, oldAccount, newAccount))
      router.refresh()
    })
  }

  return (
    <>
      {hideTrigger ? null : (
        <button
          onClick={() => {
            setOpen(true)
            setDone(null)
            setError(null)
          }}
          className="text-xs text-accent hover:text-accent-hover font-serif italic"
          title={w.triggerTitle}
        >
          {w.trigger}
        </button>
      )}

      {sheet ? (
        <FinDialog open={open} onClose={() => !isPending && setOpen(false)} title={w.title} locked={isPending}>
          <DialogForm
            onSubmit={submit}
            buttons={
              <>
                <DialogButton onClick={() => setOpen(false)} disabled={isPending}>
                  {done ? 'Close' : 'Cancel'}
                </DialogButton>
                {done ? null : (
                  <DialogButton type="submit" kind="primary" disabled={isPending}>
                    {isPending ? w.saving : w.confirm}
                  </DialogButton>
                )}
              </>
            }
          >
            <Hint>{w.intro}</Hint>
            <Field label={w.from} htmlFor="reassign-gl-from-sheet">
              <Select id="reassign-gl-from-sheet" round={12} className={fm.select} value={oldAccount} onChange={(e) => setOldAccount(e.target.value)}>
                <option value="">Select…</option>
                {fromOptions.map((o) => (
                  <option key={o.code} value={o.code} data-search={o.code}>
                    {`${o.code} · ${o.name} (RM ${o.total.toLocaleString('en-MY', { minimumFractionDigits: 2 })})`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={w.to} htmlFor="reassign-gl-to-sheet">
              <Select id="reassign-gl-to-sheet" round={12} className={fm.select} value={newAccount} onChange={(e) => setNewAccount(e.target.value)}>
                <option value="">Select…</option>
                {accountOptions.map((o) => (
                  <option key={o.code} value={o.code} data-search={o.code}>
                    {`${o.code} · ${o.name}`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={w.reason} htmlFor="reassign-gl-reason-sheet">
              <Input id="reassign-gl-reason-sheet" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={w.reasonHint} />
            </Field>
            {error ? <Hint danger>{error}</Hint> : done ? <Hint>{done}</Hint> : null}
          </DialogForm>
        </FinDialog>
      ) : open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/45 p-4" {...backdropDismiss(() => !isPending && setOpen(false))}>
          <div className="bg-paper border border-hairline rounded-panel shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-hairline">
              <div className="font-serif italic text-accent text-sm">Reassign GL account</div>
              <div className="font-serif text-lg text-ink">{w.title}</div>
              <p className="font-serif italic text-muted text-xs mt-1">{w.intro}</p>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label htmlFor="reassign-gl-from" className="block text-sm font-sans font-medium text-graphite mb-1.5">
                  {w.from}
                </label>
                <select
                  id="reassign-gl-from"
                  value={oldAccount}
                  onChange={(e) => setOldAccount(e.target.value)}
                  className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
                >
                  <option value="">Select…</option>
                  {fromOptions.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.code} · {o.name} (RM {o.total.toLocaleString('en-MY', { minimumFractionDigits: 2 })})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="reassign-gl-to" className="block text-sm font-sans font-medium text-graphite mb-1.5">
                  {w.to}
                </label>
                <select
                  id="reassign-gl-to"
                  value={newAccount}
                  onChange={(e) => setNewAccount(e.target.value)}
                  className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
                >
                  <option value="">Select…</option>
                  {accountOptions.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.code} · {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="reassign-gl-reason" className="block text-sm font-sans font-medium text-graphite mb-1.5">
                  {w.reason} <span className="text-danger">*</span>
                </label>
                <input
                  id="reassign-gl-reason"
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
