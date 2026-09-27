'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import type { UpsaleView } from '../../../_lib/upsales'
import { confirmErpAdjustment, dismissErpAdjustment, reopenErpAdjustment } from '../../../upsale-actions'

interface Props {
  /** YYYY-MM-01 — the month a confirmed change is paid in. */
  period: string
  pending: UpsaleView[]
  /**
   * The ERP's changes already paid into THIS month — each can go back to
   * waiting (Undo) until the month is in payroll.
   */
  paid?: UpsaleView[]
  /** This month is in payroll: nothing is paid into it, or sent back, until it is taken back. */
  locked: boolean
  /**
   * "September 2026" when this month was settled by hand, before the first
   * month the portal pays: it takes no run, so a change paid into it would
   * never be paid at all.
   */
  settledBefore?: string | null
}

function monthName(period: string | null, style: 'long' | 'short' = 'short'): string {
  if (!period) return '—'
  return new Date(`${period}T00:00:00Z`).toLocaleString('en-US', { month: style, year: 'numeric', timeZone: 'UTC' })
}

function signed(amount: number) {
  return amount < 0 ? <span className="neg">{formatMoney(amount)}</span> : formatMoney(amount)
}

function Bill({ change }: { change: UpsaleView }) {
  return (
    <>
      <span className="font-mono text-xs text-ink">{change.originalRef}</span>
      {change.erpDocNo && change.erpDocNo !== change.originalRef ? (
        <small className="block font-mono text-[10px] text-muted">{change.erpDocNo}</small>
      ) : null}
    </>
  )
}

function Difference({ change }: { change: UpsaleView }) {
  return (
    <>
      {signed(change.amount)}
      <small className={`block font-mono text-[10px] uppercase ${change.kind === 'drop' ? 'text-danger' : 'text-ledger'}`}>
        {change.kind === 'drop' ? 'Drop sales' : 'Upsell'}
      </small>
    </>
  )
}

/**
 * Drops and upsells the ERP revealed on settled bills (user 2026-09-26: 这个月
 * 哪些要扣减 commission，哪些有 upsell 要加 commission).
 *
 * The ERP has no drop or upsell of its own — every save re-sends the whole
 * document. When a bill of a month already settled changes, the receiver holds
 * the delivery and works out the difference from what was settled
 * (`erp_sync_note_adjustment`): a drop takes its commission back, an upsell
 * earns. Nothing is paid until somebody says so here, into the month on screen.
 *
 * This is the ONLY way a drop or upsell reaches a month (2026-09-27 — user:
 * 所有的 order 都只会从 ERP 那边抽过来，这边不需要自己调动). The form HR typed
 * them into by hand went; what the ERP found and somebody paid into this month
 * is listed under what still waits, where Undo sends it back to wait.
 */
export default function ErpChangesPanel({ period, pending, paid = [], locked, settledBefore = null }: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [undoing, setUndoing] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (pending.length === 0 && paid.length === 0) return null

  const drops = pending.filter(p => p.kind === 'drop').reduce((a, p) => a + p.amount, 0)
  const upsells = pending.filter(p => p.kind === 'upsale').reduce((a, p) => a + p.amount, 0)
  const paidNet = paid.reduce((a, p) => a + p.amount, 0)

  function answer(id: string, action: () => Promise<void>) {
    setError(null)
    setBusy(id)
    startTransition(async () => {
      try {
        await action()
        setUndoing(null)
        router.refresh()
      } catch (err) {
        const text = err instanceof Error ? err.message : 'That did not save'
        if (!text.includes('NEXT_REDIRECT')) setError(text)
      } finally {
        setBusy(null)
      }
    })
  }

  return (
    <section aria-label="Drops and upsells the ERP found" className="mb-6 border border-hairline rounded-card bg-surface px-4 py-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
        <h2 className="font-serif text-[17px] text-ink">Drops and upsells the ERP found</h2>
        {pending.length > 0 ? (
          <span className="font-mono text-[11px] uppercase tracking-[0.02em] text-alert">
            {pending.length} to answer
          </span>
        ) : null}
        <span className="font-mono text-[11px] text-graphite">
          {drops !== 0 ? <>drops {signed(drops)}</> : null}
          {drops !== 0 && upsells !== 0 ? ' · ' : null}
          {upsells !== 0 ? <>upsells {formatMoney(upsells)}</> : null}
        </span>
      </div>
      <p className="font-serif italic text-sm text-graphite mb-3 max-w-3xl">
        The ERP changed bills of months that were already settled. Each difference is paid in the
        month you confirm it, at the salesperson&apos;s own rate — a drop takes its commission back —
        and moves their upline&apos;s override the same way. Transport and other charges never count.
      </p>
      {settledBefore && pending.length > 0 ? (
        <p className="font-serif italic text-sm text-ink mb-3">
          {monthName(period, 'long')} was settled by hand and takes no run — pay these in {settledBefore} or later.
        </p>
      ) : locked && pending.length > 0 ? (
        <p className="font-serif italic text-sm text-ink mb-3">
          {monthName(period, 'long')} is in payroll — open a later month to pay these, or take this one back first.
        </p>
      ) : null}
      {pending.length > 0 ? (
        <div className="border border-hairline rounded-card bg-paper overflow-x-auto">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Bill</th>
                <th className="m-hide">Salesperson</th>
                <th className="m-hide">Settled in</th>
                <th className="right m-hide">Settled</th>
                <th className="right m-hide">ERP now</th>
                <th className="right">Difference</th>
                <th aria-label="Answer" />
              </tr>
            </thead>
            <tbody>
              {pending.map(p => (
                <tr key={p.id}>
                  <td><Bill change={p} /></td>
                  <td className="m-hide" data-label="Salesperson">{p.staffName}</td>
                  <td className="m-hide" data-label="Settled in">{monthName(p.originalPeriod)}</td>
                  <td className="num m-hide" data-label="Settled">{p.settledAmount === null ? '—' : formatMoney(p.settledAmount)}</td>
                  <td className="num m-hide" data-label="ERP now">{p.erpAmount === null ? '—' : formatMoney(p.erpAmount)}</td>
                  <td className="num"><Difference change={p} /></td>
                  <td className="whitespace-nowrap">
                    {/* Stacked, so the panel fits beside the sidebar without scrolling sideways. */}
                    <div className="flex flex-col items-start gap-1.5">
                      <button
                        type="button"
                        disabled={locked || Boolean(settledBefore) || isPending}
                        onClick={() => answer(p.id, () => confirmErpAdjustment(p.id, period))}
                        className="bg-accent hover:bg-accent-hover text-white font-serif italic text-xs px-3 py-1.5 rounded-control transition-colors disabled:opacity-40"
                      >
                        {busy === p.id ? 'Saving…' : `Pay in ${monthName(period)}`}
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          if (window.confirm(`${p.originalRef}: let the ERP's figure stand and pay no ${p.kind === 'drop' ? 'drop' : 'upsell'}?`)) {
                            answer(p.id, () => dismissErpAdjustment(p.id))
                          }
                        }}
                        className="font-mono text-[10px] uppercase tracking-wide text-muted hover:text-danger disabled:opacity-40"
                        title="A correction, not a real drop or upsell — later changes are measured from the ERP's figure"
                      >
                        Not a change
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {paid.length > 0 ? (
        <div className={pending.length > 0 ? 'mt-4' : undefined}>
          <div className="font-mono text-[10.5px] uppercase tracking-wide text-graphite mb-2">
            Paid in {monthName(period, 'long')} · {paid.length} · net {signed(paidNet)}
          </div>
          <div className="border border-hairline rounded-card bg-paper overflow-x-auto">
            <table className="ledger-table" aria-label={`Paid in ${monthName(period, 'long')}`}>
              <thead>
                <tr>
                  <th>Bill</th>
                  <th className="m-hide">Salesperson</th>
                  <th className="m-hide">Settled in</th>
                  <th className="right">Difference</th>
                  {locked ? null : <th aria-label="Undo" />}
                </tr>
              </thead>
              <tbody>
                {paid.map(p => (
                  <tr key={p.id}>
                    <td><Bill change={p} /></td>
                    <td className="m-hide" data-label="Salesperson">{p.staffName}</td>
                    <td className="m-hide" data-label="Settled in">{monthName(p.originalPeriod)}</td>
                    <td className="num"><Difference change={p} /></td>
                    {locked ? null : (
                      <td className="whitespace-nowrap">
                        {/* Only the latest answer on a bill goes back; the action says so if not. */}
                        {undoing === p.id ? (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => answer(p.id, () => reopenErpAdjustment(p.id))}
                            className="font-mono text-[10px] uppercase tracking-wide text-danger disabled:opacity-40"
                          >
                            {busy === p.id ? 'Saving…' : 'Confirm — back to waiting'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => setUndoing(p.id)}
                            className="font-mono text-[10px] uppercase tracking-wide text-muted hover:text-ink disabled:opacity-40"
                          >
                            Undo
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {error ? <p role="alert" className="font-serif italic text-sm text-danger mt-3">{error}</p> : null}
    </section>
  )
}
