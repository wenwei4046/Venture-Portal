'use client'

// Change the income GL account of an ISSUED/PAID invoice (user 2026-08-24:
// "invoice 那边选的account 也是同理，我要能更改"). Server RPC edits the
// posted journal lines in place, keeps the invoice's category in sync, and
// stamps an audit note. Old account auto-detects (the RPC errors with the
// candidate list if the invoice posted to several — then pick one here).

import { useState, useTransition } from 'react'
import { backdropDismiss } from '@/components/modal-dismiss'
import { useRouter } from 'next/navigation'
import { reassignInvoiceGlAccount } from '../actions'

interface CategoryOption {
  code: string
  label: string
}

export default function ReassignInvoiceGlButton({
  invoiceId,
  invoiceNo,
  currentCategory,
  categories,
  postedAccounts = [],
}: {
  invoiceId: string
  invoiceNo: string | null
  currentCategory: string | null
  categories: CategoryOption[]
  /** The accounts this invoice actually posted to, with their amounts. A split
   *  invoice has several — HV-INV-202609-0040 put one recruitment bill across
   *  five subsidiaries — and they can now be moved in one go (user 2026-09-28:
   *  "我一次只能改一个?"). */
  postedAccounts?: Array<{ code: string; amount: number }>
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [oldAccount, setOldAccount] = useState(currentCategory ?? '')
  const multi = postedAccounts.length > 1
  const [picked, setPicked] = useState<string[]>(() => postedAccounts.map((a) => a.code))
  const labelOf = (code: string) => categories.find((c) => c.code === code)?.label ?? code
  const [newAccount, setNewAccount] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    setError(null)
    if (!newAccount) return setError('选新的 account')
    const from = multi ? picked.filter((c) => c !== newAccount) : oldAccount ? [oldAccount] : []
    if (multi && from.length === 0) return setError('勾至少一个要改的 account')
    if (!multi && oldAccount && newAccount === oldAccount) return setError('新旧 account 一样')
    if (!reason.trim()) return setError('写一句原因(会记进 GL 的审计注记)')
    const fd = new FormData()
    fd.set('id', invoiceId)
    fd.set('old_account', from.join(','))
    fd.set('new_account', newAccount)
    fd.set('reason', reason.trim())
    startTransition(async () => {
      const res = await reassignInvoiceGlAccount(fd)
      if (res.error) {
        setError(res.error)
        return
      }
      setDone(`改好了 — ${res.changed} 条 GL 行已从 ${res.oldAccount ?? oldAccount} 移去 ${newAccount}。`)
      router.refresh()
    })
  }

  return (
    <>
      <button
        onClick={() => {
          setOpen(true)
          setDone(null)
          setError(null)
        }}
        className="text-xs text-muted hover:text-accent font-serif italic"
        title="开单后 income account 放错用这个:直接把已过账的 GL 行移去对的科目,发票 category 一起更新,自动留审计注记"
      >
        改 account
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/45 p-4" {...backdropDismiss(() => !isPending && setOpen(false))}>
          <div className="bg-paper border border-hairline rounded-panel shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-hairline">
              <div className="font-serif italic text-accent text-sm">Reassign GL account</div>
              <div className="font-serif text-lg text-ink">改发票 {invoiceNo ?? invoiceId.slice(0, 8)} 的收入科目</div>
              <p className="font-serif italic text-muted text-xs mt-1">
                同一笔分录、同金额同日期,只把科目移过去 — P&amp;L / 报表一起更新,发票的 category 也会跟着改,GL 上留改动注记。
              </p>
            </div>
            <div className="px-6 py-4 space-y-4">
              {multi ? (
                <div>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <label className="block text-sm font-sans font-medium text-graphite">
                      要改哪几个{' '}
                      <span className="text-muted font-normal">(这张发票分了 {postedAccounts.length} 个科目)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setPicked(picked.length === postedAccounts.length ? [] : postedAccounts.map((a) => a.code))
                      }
                      className="text-xs font-sans text-accent hover:underline"
                    >
                      {picked.length === postedAccounts.length ? '全部不选' : '全选'}
                    </button>
                  </div>
                  <div className="border border-hairline rounded-md divide-y divide-hairline max-h-52 overflow-y-auto">
                    {postedAccounts.map((a) => (
                      <label
                        key={a.code}
                        className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-surface"
                      >
                        <input
                          type="checkbox"
                          checked={picked.includes(a.code)}
                          onChange={(e) =>
                            setPicked((prev) =>
                              e.target.checked ? [...prev, a.code] : prev.filter((c) => c !== a.code),
                            )
                          }
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                        <span className="font-mono text-[11px] text-graphite">{a.code}</span>
                        <span className="flex-1 text-ink truncate">{labelOf(a.code)}</span>
                        <span className="font-mono tabular text-[12px] text-graphite">
                          {a.amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
                    现在的 account <span className="text-muted font-normal">(留空 = 自动侦测)</span>
                  </label>
                  <select
                    value={oldAccount}
                    onChange={(e) => setOldAccount(e.target.value)}
                    className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
                  >
                    <option value="">自动侦测(单科目发票)</option>
                    {categories.map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.code} · {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-sans font-medium text-graphite mb-1.5">改去(对的 account)</label>
                <select
                  value={newAccount}
                  onChange={(e) => setNewAccount(e.target.value)}
                  className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink focus:outline-none focus:border-accent-border"
                >
                  <option value="">Select…</option>
                  {categories.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.code} · {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-sans font-medium text-graphite mb-1.5">
                  原因 <span className="text-danger">*</span>
                </label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. 开单时选错科目"
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
