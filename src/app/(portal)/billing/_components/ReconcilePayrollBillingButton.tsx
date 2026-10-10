'use client'

import { useEffect, useState, useTransition } from 'react'
import { backdropDismiss } from '@/components/modal-dismiss'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'
import { fetchPayrollBillingDelta, generatePayrollAdjustmentInvoices } from '../actions'
import type { CompanyBillingDelta } from '@/lib/payroll-billing-delta'

// 对数补差 (user 2026-09-04): compare live payroll allocation vs the period's
// issued consolidated invoices, per subsidiary per segment. Under-billed gaps
// (e.g. HR corrected payroll after the invoices went out) get ONE draft
// adjustment invoice per company in the same consolidated format. Over-billed
// segments are shown but never auto-adjusted (no CN on consolidated invoices).

function fmt(n: number): string {
  return n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface Props {
  currentPeriod: string
  /** Arrive open, from a page-head menu (2026-10-10, the handoff's
   *  "From payroll ▾" / "+ Create Invoice ▾"). */
  autoOpen?: boolean
  /** No trigger button of its own — the menu item is the trigger. */
  hideTrigger?: boolean
}

// One instance per month — see CreateInvoiceButton. Both the delta lookup and
// the top-up drafts use the local `period`, seeded once.
export default function ReconcilePayrollBillingButton(props: Props) {
  return <ReconcilePayrollBillingButtonBody key={props.currentPeriod} {...props} />
}

function ReconcilePayrollBillingButtonBody({ currentPeriod, autoOpen = false, hideTrigger = false }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(autoOpen)
  const [period, setPeriod] = useState(dayjs(currentPeriod).format('YYYY-MM'))
  const [rows, setRows] = useState<CompanyBillingDelta[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setResult(null)
    setRows(null)
    fetchPayrollBillingDelta(dayjs(period + '-01').format('YYYY-MM-DD'))
      .then((r) => {
        if (!cancelled) setRows(r)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, period])

  const underBilled = (rows ?? []).filter((r) => r.hasIssuedInvoice && r.positiveTotal > 0.005)
  const missingInvoice = (rows ?? []).filter((r) => !r.hasIssuedInvoice && r.positiveTotal > 0.005)
  const topUpTotal = Math.round(underBilled.reduce((s, r) => s + r.positiveTotal, 0) * 100) / 100

  function handleTopUp() {
    setError(null)
    startTransition(async () => {
      try {
        const res = await generatePayrollAdjustmentInvoices(dayjs(period + '-01').format('YYYY-MM-DD'))
        setResult(`已开草稿：${res.generated.join('、')} — 去下面 invoice 列表 review 后 issue。`)
        router.refresh()
        // Re-load the table so the drafts-pending state is visible on re-open.
        const r = await fetchPayrollBillingDelta(dayjs(period + '-01').format('YYYY-MM-DD'))
        setRows(r)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create adjustment drafts')
      }
    })
  }

  return (
    <>
      {hideTrigger ? null : (
      <button
        onClick={() => setOpen(true)}
        className="bg-surface hover:bg-paper border border-hairline text-graphite hover:text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
        title="对数补差 — compare live payroll vs issued consolidated invoices, top up any gap"
      >
        对数补差
      </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 bg-scrim/45 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
          {...backdropDismiss(() => !isPending && setOpen(false))}
        >
          <div
            className="bg-paper border border-hairline rounded-panel shadow-xl w-full max-w-3xl my-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between px-6 py-4 border-b border-hairline">
              <div>
                <h2 className="font-serif text-2xl text-ink">对数补差 · Payroll billing reconcile</h2>
                <p className="font-serif italic text-graphite text-xs mt-1">
                  比对「按现在 payroll 应开」vs「已 issue 的合并发票」。HR 改了 payroll 后来这里看差额，
                  一键补开差额草稿（跟原发票同格式、同账务路由）。
                </p>
              </div>
              <button
                onClick={() => !isPending && setOpen(false)}
                disabled={isPending}
                className="text-muted hover:text-ink text-2xl leading-none pt-1 disabled:opacity-50"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="max-w-[220px]">
                <div className="text-xs font-sans font-medium text-graphite mb-1">Period</div>
                <input
                  type="month"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  disabled={isPending}
                  className="w-full px-3 py-2 bg-paper border border-hairline rounded-md text-sm text-ink font-mono focus:outline-none focus:border-accent-border disabled:opacity-50"
                />
              </div>

              {loading && <p className="font-serif italic text-muted text-sm">对数中…</p>}

              {!loading && rows && rows.length === 0 && (
                <div className="border border-hairline rounded-md bg-surface p-6 text-center">
                  <p className="font-serif italic text-muted text-sm">
                    这个月没有 payroll allocation 也没有合并发票，没东西可对。
                  </p>
                </div>
              )}

              {!loading && rows && rows.length > 0 && (
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th className="num">已开 Billed</th>
                      <th className="num">应开 Should</th>
                      <th className="num">差额 Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.companyId}>
                        <td>
                          <div className="font-serif text-md text-ink">
                            {r.shortCode}
                            {r.delta === 0 ? (
                              <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-ledger border border-hairline rounded px-1.5 py-0.5">对上 ✓</span>
                            ) : !r.hasIssuedInvoice ? (
                              <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-alert border border-hairline rounded px-1.5 py-0.5">整张未开</span>
                            ) : r.positiveTotal > 0.005 ? (
                              <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-danger border border-hairline rounded px-1.5 py-0.5">少开 {fmt(r.positiveTotal)}</span>
                            ) : null}
                            {r.negatives.length > 0 ? (
                              <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-alert border border-hairline rounded px-1.5 py-0.5">有多开</span>
                            ) : null}
                          </div>
                          {r.segments
                            .filter((s) => s.delta !== 0)
                            .map((s) => (
                              <div key={s.segment} className="font-mono text-xs text-muted">
                                {s.deptLabel}: 已开 {fmt(s.billed)} → 应开 {fmt(s.should)} ({s.delta > 0 ? '+' : ''}{fmt(s.delta)})
                                {s.componentDeltas ? (
                                  <span className="text-muted">
                                    {' · '}
                                    {s.componentDeltas.map((c) => `${c.label} ${fmt(c.amount)}`).join(' / ')}
                                  </span>
                                ) : null}
                              </div>
                            ))}
                        </td>
                        <td className="num">{fmt(r.billed)}</td>
                        <td className="num">{fmt(r.should)}</td>
                        <td className={`num font-medium ${r.delta === 0 ? 'text-ledger' : r.delta > 0 ? 'text-danger' : 'text-alert'}`}>
                          {r.delta === 0 ? '—' : `${r.delta > 0 ? '+' : ''}${fmt(r.delta)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {!loading && missingInvoice.length > 0 && (
                <p className="font-serif italic text-alert text-xs">
                  {missingInvoice.map((r) => r.shortCode).join('、')} 整张合并发票都没开 — 用「Generate
                  payroll invoices」正常生成，不在补差范围。
                </p>
              )}
              {!loading && rows && rows.some((r) => r.negatives.length > 0) && (
                <p className="font-serif italic text-alert text-xs">
                  有「多开」的部分系统不会自动冲（合并发票不支持 credit note）— 找 Finance 手动处理。
                </p>
              )}

              {result && (
                <div className="bg-ledger/10 border border-ledger/30 text-ledger rounded-md px-3 py-2 text-sm font-sans">
                  {result}
                </div>
              )}
              {error && (
                <div className="bg-danger/10 border border-danger/30 text-danger rounded-md px-3 py-2 text-sm font-sans">
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-hairline bg-surface">
              <div className="font-serif italic text-muted text-xs">
                补开的是 DRAFT — review 后照平时流程 issue。日期落在该月月底，算回当月账。
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => !isPending && setOpen(false)}
                  disabled={isPending}
                  className="text-sm font-sans text-muted hover:text-ink disabled:opacity-50"
                >
                  Close
                </button>
                <button
                  onClick={handleTopUp}
                  disabled={isPending || loading || underBilled.length === 0}
                  className="bg-accent hover:bg-accent-hover text-white font-serif italic text-sm px-4 py-2 rounded-md transition-colors disabled:opacity-50"
                >
                  {isPending
                    ? '开草稿中…'
                    : underBilled.length === 0
                      ? '没有可补的差额'
                      : `补开差额草稿 (${underBilled.length} 张 · RM ${fmt(topUpTotal)})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
