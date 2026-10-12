'use client'

import Link from 'next/link'
import { useState, useTransition, type MouseEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import type { UpsaleView } from '../../../_lib/upsales'
import { confirmErpAdjustment, dismissErpAdjustment, reopenErpAdjustment } from '../../../upsale-actions'
import { onTheRow } from '../orders/_components/useBillMenu'
import s from './commission-workbench.module.css'

interface Props {
  /** YYYY-MM-01 — the month a confirmed change is paid in. */
  period: string
  pending: UpsaleView[]
  /**
   * The ERP's changes already paid into THIS month — each can go back to
   * waiting (Undo) until the month is in payroll.
   */
  paid?: UpsaleView[]
  /** This month is in payroll: nothing is paid into it, or sent back. */
  locked: boolean
  /**
   * "September 2026" when this month was settled by hand, before the first
   * month the portal pays: it takes no run, so a change paid into it would
   * never be paid at all.
   */
  settledBefore?: string | null
  /**
   * A tab of the month's workbench (2026-09-30): drawn whatever it holds, with
   * an empty state. Alone on a page it says nothing when there is nothing.
   */
  inTab?: boolean
  /**
   * The bill each change was found on (2026-10-12), by the change's id: its
   * number is a link and a double-click on its row opens it. A change whose
   * bill the portal does not hold has none.
   */
  billLinks?: Readonly<Record<string, string>>
}

function monthName(period: string | null, style: 'long' | 'short' = 'short'): string {
  if (!period) return '—'
  return new Date(`${period}T00:00:00Z`).toLocaleString('en-US', { month: style, year: 'numeric', timeZone: 'UTC' })
}

function signed(amount: number) {
  return amount < 0 ? <span className="neg">{formatMoney(amount)}</span> : formatMoney(amount)
}

function Bill({ change, href }: { change: UpsaleView; href?: string }) {
  return (
    <>
      {href ? <Link href={href}>{change.originalRef}</Link> : <span>{change.originalRef}</span>}
      {change.erpDocNo && change.erpDocNo !== change.originalRef ? <small>{change.erpDocNo}</small> : null}
    </>
  )
}

function Difference({ change }: { change: UpsaleView }) {
  return (
    <>
      {signed(change.amount)}
      <small>{change.kind === 'drop' ? 'Drop sales' : 'Upsell'}</small>
    </>
  )
}

function Summary({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return <div className={s.summary}><span className={s.summaryLabel}>{label}</span><strong className={s.summaryValue}>{value}</strong>{note ? <small>{note}</small> : null}</div>
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
 * 所有的 order 都只会从 ERP 那边抽过来，这边不需要自己调动). What the ERP found
 * and somebody paid into this month is listed under what still waits, where
 * Undo sends it back to wait. A tab of the month's workbench since 2026-09-30,
 * in its table design; it sat above the month's cards until then.
 */
export default function ErpChangesPanel({ period, pending, paid = [], locked, settledBefore = null, inTab = false, billLinks = {} }: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [undoing, setUndoing] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!inTab && pending.length === 0 && paid.length === 0) return null

  /** A double-click on a change's row opens its bill — not one on its buttons. */
  function openBill(event: MouseEvent<HTMLElement>, id: string) {
    const href = billLinks[id]
    if (!href || !onTheRow(event)) return
    window.getSelection()?.removeAllRanges()
    if (event.ctrlKey || event.metaKey) window.open(href, '_blank', 'noopener')
    else router.push(href)
  }

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
    <section aria-label="Drops and upsells the ERP found">
      <div className={s.topLine}>
        <div>
          <h2 className={s.sectionHeading}>Drops and upsells the ERP found</h2>
          <p className={s.subtitle}>
            The ERP changed bills of months that were already settled. Each difference is paid in the month
            you confirm it, at the salesperson&apos;s own rate — a drop takes its commission back — and moves
            their upline&apos;s override the same way. Transport and other charges never count.
          </p>
        </div>
      </div>

      {pending.length > 0 || paid.length > 0 ? (
        <div className={s.summaryGrid}>
          <Summary label="To answer" value={String(pending.length)} note={pending.length ? 'Pay it in, or let the ERP’s figure stand' : 'Nothing waiting'} />
          <Summary label="Drops waiting" value={signed(drops)} note="Commission taken back when paid in" />
          <Summary label="Upsells waiting" value={formatMoney(upsells)} note="Earns at the salesperson’s rate" />
          <Summary label={`Paid in ${monthName(period, 'long')}`} value={String(paid.length)} note={<>net {signed(paidNet)}</>} />
        </div>
      ) : null}

      {settledBefore && pending.length > 0 ? (
        <p className={s.notice}>
          {monthName(period, 'long')} was settled by hand and takes no run — pay these in {settledBefore} or later.
        </p>
      ) : locked && pending.length > 0 ? (
        <p className={s.notice}>
          {monthName(period, 'long')} is in payroll — open a later month to pay these.
        </p>
      ) : null}

      {pending.length > 0 ? (
        <div className={s.tableFrame}>
          <div className={s.tableScroll} role="region" aria-label="Drops and upsells to answer, scroll horizontally" tabIndex={0}>
            <table className={s.table} aria-label="Drops and upsells to answer">
              <thead>
                <tr>
                  <th className={s.stickyFirst}>Bill</th>
                  <th>Salesperson</th>
                  <th>Settled in</th>
                  <th className={s.numeric}>Settled</th>
                  <th className={s.numeric}>ERP now</th>
                  <th className={s.numeric}>Difference</th>
                  <th>Answer</th>
                </tr>
              </thead>
              <tbody>
                {pending.map(p => (
                  <tr key={p.id} onDoubleClick={event => openBill(event, p.id)}>
                    <td className={s.stickyFirst}><Bill change={p} href={billLinks[p.id]} /></td>
                    <td>{p.staffName}</td>
                    <td>{monthName(p.originalPeriod)}</td>
                    <td className={s.numeric}>{p.settledAmount === null ? '—' : formatMoney(p.settledAmount)}</td>
                    <td className={s.numeric}>{p.erpAmount === null ? '—' : formatMoney(p.erpAmount)}</td>
                    <td className={s.numeric}><Difference change={p} /></td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className={s.primaryButton}
                          disabled={locked || Boolean(settledBefore) || isPending}
                          onClick={() => answer(p.id, () => confirmErpAdjustment(p.id, period))}
                        >
                          {busy === p.id ? 'Saving…' : `Pay in ${monthName(period)}`}
                        </button>
                        <button
                          type="button"
                          className={s.ghostButton}
                          disabled={isPending}
                          onClick={() => {
                            if (window.confirm(`${p.originalRef}: let the ERP's figure stand and pay no ${p.kind === 'drop' ? 'drop' : 'upsell'}?`)) {
                              answer(p.id, () => dismissErpAdjustment(p.id))
                            }
                          }}
                          title="A correction, not a real drop or upsell — later changes are measured from the ERP's figure"
                        >
                          Not a change
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className={s.stickyFirst}>{pending.length} to answer</td>
                  <td colSpan={4}>drops {signed(drops)} · upsells {formatMoney(upsells)}</td>
                  <td className={s.numeric}>{signed(drops + upsells)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : null}

      {paid.length > 0 ? (
        <div className={pending.length > 0 ? 'mt-5' : undefined}>
          <div className={s.topLine}>
            <h3 className={s.sectionHeading}>Paid in {monthName(period, 'long')} · {paid.length} · net {signed(paidNet)}</h3>
          </div>
          <div className={s.tableFrame}>
            <div className={s.tableScroll}>
              <table className={s.table} aria-label={`Paid in ${monthName(period, 'long')}`}>
                <thead>
                  <tr>
                    <th className={s.stickyFirst}>Bill</th>
                    <th>Salesperson</th>
                    <th>Settled in</th>
                    <th className={s.numeric}>Difference</th>
                    {locked ? null : <th aria-label="Undo" />}
                  </tr>
                </thead>
                <tbody>
                  {paid.map(p => (
                    <tr key={p.id} onDoubleClick={event => openBill(event, p.id)}>
                      <td className={s.stickyFirst}><Bill change={p} href={billLinks[p.id]} /></td>
                      <td>{p.staffName}</td>
                      <td>{monthName(p.originalPeriod)}</td>
                      <td className={s.numeric}><Difference change={p} /></td>
                      {locked ? null : (
                        <td>
                          {/* Only the latest answer on a bill goes back; the action says so if not. */}
                          {undoing === p.id ? (
                            <button type="button" className={s.ghostButton} disabled={isPending}
                              onClick={() => answer(p.id, () => reopenErpAdjustment(p.id))}>
                              {busy === p.id ? 'Saving…' : 'Confirm — back to waiting'}
                            </button>
                          ) : (
                            <button type="button" className={s.ghostButton} disabled={isPending} onClick={() => setUndoing(p.id)}>
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
        </div>
      ) : null}

      {inTab && pending.length === 0 && paid.length === 0 ? (
        <div className={`${s.tableFrame} ${s.empty}`}>
          Nothing to answer — the ERP has changed no settled bill since the last answer, and nothing it found
          is paid into {monthName(period, 'long')}.
        </div>
      ) : null}

      {error ? <p role="alert" className={s.warning}>{error}</p> : null}
    </section>
  )
}
