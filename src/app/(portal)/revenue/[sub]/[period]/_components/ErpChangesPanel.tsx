'use client'

import Link from 'next/link'
import { useState, useTransition, type MouseEvent, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { formatMoney } from '@/lib/utils'
import {
  adjustmentLabel,
  firstPayableMonth,
  kindLabel,
  kindTone,
  payableIn,
  settledWord,
  type ErpChangeKind,
} from '@/lib/commission/erp-changes'
import type { UpsaleView } from '../../../_lib/upsales'
import { confirmErpAdjustment, dismissErpAdjustment, reopenErpAdjustment } from '../../../upsale-actions'
import { onTheRow } from '../orders/_components/useBillMenu'
import s from './commission-workbench.module.css'

/**
 * What the ERP changed that a drop or an upsell is about (2026-10-13): the
 * save that moved its money, from the ERP audit trail — when, and in words.
 */
export interface ChangeBrief {
  /** The office's day and time of the Save: "30 Sep 2026 10:45". */
  savedLabel: string
  kind: ErpChangeKind
  statusAfter: string | null
  /** What changed, a sentence each — the lines first. */
  summary: string[]
}

/** One save of the month's ERP audit trail that moved money (2026-10-13). */
export interface TrailRowView {
  id: string
  savedLabel: string
  orderNo: string
  /** The paper the bill is on, when it is not the document's own number. */
  paper: string | null
  href: string | null
  seller: string
  kind: ErpChangeKind
  statusAfter: string | null
  before: number | null
  after: number | null
  delta: number
  summary: string[]
  /** What it meant for commission, in words. */
  commission: string
}

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
  /**
   * What the ERP changed that each drop or upsell is about (2026-10-13), by
   * the change's id — from the ERP audit trail. None: found before the trail
   * was kept.
   */
  briefs?: Readonly<Record<string, ChangeBrief>>
  /**
   * The month's ERP audit trail (2026-10-13): every save that moved money on
   * this month's bills, newest first. Absent: not shown.
   */
  trail?: { rows: TrailRowView[]; more: boolean; since: string }
  /**
   * Who shares the bill each change was found on, in words ("ADRIAN 50% ·
   * ANTHONY 50%"), by the change's id — the run splits the change as it
   * splits the bill (2026-10-13).
   */
  holders?: Readonly<Record<string, string>>
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
      <small>{adjustmentLabel(change.kind, change.erpReason)}</small>
      {change.status === 'confirmed' && change.answeredByFeed ? <small>Deducted directly</small> : null}
    </>
  )
}

/** The salesperson, and — on a shared bill — who shares it: the change is split as the bill is. */
function Seller({ change, holders }: { change: UpsaleView; holders: string | undefined }) {
  return (
    <>
      {change.staffName}
      {holders ? <small>Split by share · {holders}</small> : null}
    </>
  )
}

/** What gave the commission: "Claim form · Aug 2026", "Closed · Sep 2026" — the month alone before 2026-10-13. */
function Given({ change }: { change: UpsaleView }) {
  return <>{change.settledBy ? settledWord(change.settledBy, change.settledPeriod) : monthName(change.originalPeriod)}</>
}

/** When the ERP made the change and what it was, from the audit trail. */
function WhatChanged({ brief }: { brief: ChangeBrief | undefined }) {
  if (!brief) return <span className="text-graphite">—</span>
  return (
    <>
      <span className={`chip ${kindTone(brief.kind)}`}><span className="dot" />{kindLabel(brief.kind, brief.statusAfter)}</span>
      <small>Saved {brief.savedLabel}</small>
      {brief.summary.slice(0, 2).map(line => <small key={line}>{line}</small>)}
      {brief.summary.length > 2 ? <small>+ {brief.summary.length - 2} more on the bill</small> : null}
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
export default function ErpChangesPanel({
  period, pending, paid = [], locked, settledBefore = null, inTab = false, billLinks = {}, briefs = {}, holders = {}, trail,
}: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [undoing, setUndoing] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!inTab && pending.length === 0 && paid.length === 0 && !trail?.rows.length) return null

  /** A double-click on a change's row opens its bill — not one on its buttons. */
  function openBill(event: MouseEvent<HTMLElement>, id: string) {
    openTrailBill(event, billLinks[id] ?? null)
  }

  /** A double-click on an audit-trail row opens its bill, as on every bill list. */
  function openTrailBill(event: MouseEvent<HTMLElement>, href: string | null) {
    if (!href || !onTheRow(event)) return
    window.getSelection()?.removeAllRanges()
    if (event.ctrlKey || event.metaKey) window.open(href, '_blank', 'noopener')
    else router.push(href)
  }

  const drops = pending.filter(p => p.kind === 'drop').reduce((a, p) => a + p.amount, 0)
  const upsells = pending.filter(p => p.kind === 'upsale').reduce((a, p) => a + p.amount, 0)
  const paidNet = paid.reduce((a, p) => a + p.amount, 0)
  // Why nothing can be paid into this month: the Pay in button's tooltip, not
  // a notice above the table (2026-10-12).
  const payShut = settledBefore
    ? `${monthName(period, 'long')} was settled by hand and takes no run — pay these in ${settledBefore} or later`
    : locked
      ? `${monthName(period, 'long')} is in payroll — open a later month to pay these`
      : undefined

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

  /** Paid only in a month after the one that gave the commission (2026-10-13, 23ADJ). */
  const notYet = (p: UpsaleView) => !payableIn(period, p.settledPeriod)
  const notYetTitle = (p: UpsaleView) => {
    const first = firstPayableMonth(p.settledPeriod)
    return first
      ? `The commission on this bill was given in ${monthName(p.settledPeriod)} — that month already counts it as the ERP has it now. Pay this change in ${monthName(first)} or later.`
      : undefined
  }

  return (
    <section aria-label="Drops and upsells the ERP found">
      <div className={s.topLine}>
        <h2 className={s.sectionHeading}>Drops and upsells the ERP found</h2>
      </div>

      {pending.length > 0 || paid.length > 0 ? (
        <div className={s.summaryGrid}>
          <Summary label="To answer" value={String(pending.length)} note={pending.length ? 'Pay it in, or let the ERP’s figure stand' : 'Nothing waiting'} />
          <Summary label="Drops waiting" value={signed(drops)} note="Commission taken back when paid in" />
          <Summary label="Upsells waiting" value={formatMoney(upsells)} note="Earns at the salesperson’s rate" />
          <Summary label={`Paid in ${monthName(period, 'long')}`} value={String(paid.length)} note={<>net {signed(paidNet)}</>} />
        </div>
      ) : null}

      {pending.length > 0 ? (
        <div className={s.tableFrame}>
          <div className={s.tableScroll} role="region" aria-label="Drops and upsells to answer, scroll horizontally" tabIndex={0}>
            <table className={s.table} aria-label="Drops and upsells to answer">
              <thead>
                <tr>
                  <th className={s.stickyFirst}>Bill</th>
                  <th>Salesperson</th>
                  <th>What the ERP changed</th>
                  <th>Commission given</th>
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
                    <td><Seller change={p} holders={holders[p.id]} /></td>
                    <td><WhatChanged brief={briefs[p.id]} /></td>
                    <td><Given change={p} /></td>
                    <td className={s.numeric}>{p.settledAmount === null ? '—' : formatMoney(p.settledAmount)}</td>
                    <td className={s.numeric}>{p.erpAmount === null ? '—' : formatMoney(p.erpAmount)}</td>
                    <td className={s.numeric}><Difference change={p} /></td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className={s.primaryButton}
                          disabled={locked || Boolean(settledBefore) || notYet(p) || isPending}
                          title={payShut ?? (notYet(p) ? notYetTitle(p) : undefined)}
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
                  <td colSpan={5}>drops {signed(drops)} · upsells {formatMoney(upsells)}</td>
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
                    <th>What the ERP changed</th>
                    <th>Commission given</th>
                    <th className={s.numeric}>Difference</th>
                    {locked ? null : <th aria-label="Undo" />}
                  </tr>
                </thead>
                <tbody>
                  {paid.map(p => (
                    <tr key={p.id} onDoubleClick={event => openBill(event, p.id)}>
                      <td className={s.stickyFirst}><Bill change={p} href={billLinks[p.id]} /></td>
                      <td><Seller change={p} holders={holders[p.id]} /></td>
                      <td><WhatChanged brief={briefs[p.id]} /></td>
                      <td><Given change={p} /></td>
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

      {trail ? <MonthTrail period={period} trail={trail} onOpen={openTrailBill} /> : null}

      {error ? <p role="alert" className={s.warning}>{error}</p> : null}
    </section>
  )
}

/**
 * The month's ERP audit trail (2026-10-13; the user: "任何改动只要一按 save
 * 他的 sales order，我这边都要能 track 到，记录在我们自己的 audit trail 里").
 * Every save that moved money on this month's bills — what earns, or the
 * bill's total — newest first: what the ERP changed, by how much, and what it
 * meant for commission. A save that moved no money (a status, a payment) is on
 * the bill's own page.
 */
function MonthTrail({ period, trail, onOpen }: {
  period: string
  trail: NonNullable<Props['trail']>
  onOpen: (event: MouseEvent<HTMLElement>, href: string | null) => void
}) {
  const net = trail.rows.reduce((a, r) => a + r.delta, 0)
  return (
    <div className="mt-6" aria-label={`ERP audit trail of ${monthName(period, 'long')}'s bills`} role="region">
      <div className={s.topLine}>
        <h3 className={s.sectionHeading}>ERP audit trail · {monthName(period, 'long')}&apos;s bills · {trail.rows.length}</h3>
      </div>
      {trail.rows.length === 0 ? (
        <div className={`${s.tableFrame} ${s.empty}`}>
          No save has moved money on {monthName(period, 'long')}&apos;s bills since the record began.
        </div>
      ) : (
        <div className={s.tableFrame}>
          <div className={s.tableScroll} role="region" aria-label="ERP audit trail, scroll horizontally" tabIndex={0}>
            <table className={s.table} aria-label="ERP audit trail">
              <thead>
                <tr>
                  <th className={s.stickyFirst}>Saved</th>
                  <th>Bill</th>
                  <th>Salesperson</th>
                  <th>Change</th>
                  <th className={s.numeric}>Earned before</th>
                  <th className={s.numeric}>Earns now</th>
                  <th className={s.numeric}>Difference</th>
                  <th>What changed</th>
                  <th>Commission</th>
                </tr>
              </thead>
              <tbody>
                {trail.rows.map(r => (
                  <tr key={r.id} onDoubleClick={event => onOpen(event, r.href)}>
                    <td className={s.stickyFirst}>{r.savedLabel}</td>
                    <td>
                      {r.href ? <Link href={r.href}>{r.orderNo}</Link> : <span>{r.orderNo}</span>}
                      {r.paper ? <small>{r.paper}</small> : null}
                    </td>
                    <td>{r.seller}</td>
                    <td><span className={`chip ${kindTone(r.kind)}`}><span className="dot" />{kindLabel(r.kind, r.statusAfter)}</span></td>
                    <td className={s.numeric}>{r.before === null ? '—' : formatMoney(r.before)}</td>
                    <td className={s.numeric}>{r.after === null ? '—' : formatMoney(r.after)}</td>
                    <td className={s.numeric}>{r.delta === 0 ? '—' : signed(r.delta)}</td>
                    <td>{r.summary.map(line => <small key={line}>{line}</small>)}</td>
                    <td><small>{r.commission}</small></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className={s.stickyFirst}>{trail.rows.length} saves</td>
                  <td colSpan={5}>{trail.more ? 'The latest 500 — every save is on its bill’s page' : 'What earns moved by'}</td>
                  <td className={s.numeric}>{signed(Math.round(net * 100) / 100)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
