'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import dayjs from 'dayjs'
import { formatMoneyBare } from '@/lib/utils'
import type { RepaymentPlan } from '@/lib/repayment-plan'

// Print schedule (2026-10-09, the user's Claude Design handoff): the plan on
// a page of its own — the letterhead, the deal's terms in two columns, every
// installment, the totals — over the page, with Print and Close. Printing
// shows only this sheet (globals.css › .sched-print). The list's right-click
// "Print schedule" opens the record with ?print=1, which opens it straight
// away.

const money = (n: number | null) => (n === null ? '—' : formatMoneyBare(n))

export default function PrintSchedule({
  kicker,
  name,
  meta,
  plan,
  printed,
  autoOpen = false,
}: {
  /** e.g. FUND IN · SUBSIDIARY */
  kicker: string
  /** Who the deal is with. */
  name: string
  meta: Array<{ label: string; value: string }>
  plan: RepaymentPlan
  /** e.g. Printed 9 Oct 2026 · Finance Manager */
  printed: string
  autoOpen?: boolean
}) {
  const [open, setOpen] = useState(autoOpen)

  // While it is open the page prints the sheet alone.
  useEffect(() => {
    if (!open) return
    document.body.classList.add('printing-schedule')
    return () => document.body.classList.remove('printing-schedule')
  }, [open])

  const title = `Repayment Schedule · ${name}`
  const sum = (pick: (r: RepaymentPlan['rows'][number]) => number | null) => plan.rows.reduce((s, r) => s + (pick(r) ?? 0), 0)

  return (
    <>
      <button type="button" className="btn-quiet-sheet" onClick={() => setOpen(true)}>
        Print schedule
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div className="sched-print" role="dialog" aria-modal="true" aria-label={title}>
              <div className="sched-print-bar">
                <button type="button" className="btn-pri-sheet" onClick={() => window.print()}>
                  Print
                </button>
                <button type="button" className="btn-quiet-sheet" onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>
              <div className="sched-print-sheet">
                <div className="sched-print-letterhead">
                  <div>
                    <div className="sched-print-house">HOUZS Venture Sdn Bhd</div>
                    <div className="sched-print-kicker">Internal ledger</div>
                  </div>
                  <div className="sched-print-printed">{printed}</div>
                </div>
                <div className="sched-print-kicker sched-print-what">{kicker}</div>
                <h1 className="sched-print-title">{title}</h1>
                <dl className="sched-print-meta">
                  {meta.map((m) => (
                    <div key={m.label}>
                      <dt>{m.label}</dt>
                      <dd>{m.value}</dd>
                    </div>
                  ))}
                </dl>
                <table className="sched-print-table">
                  <thead>
                    <tr>
                      <th>No.</th>
                      <th className="left">Date</th>
                      <th>Installment</th>
                      <th>Principal</th>
                      <th>Interest</th>
                      <th>Balance</th>
                      <th>Outstanding</th>
                      <th className="left">Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.rows.map((r) => (
                      <tr key={r.no}>
                        <td>{r.no}</td>
                        <td className="left">{dayjs(r.due).format('D MMM YYYY')}</td>
                        <td>{money(r.installment)}</td>
                        <td>{money(r.principal)}</td>
                        <td>{money(r.interest)}</td>
                        <td>{money(r.balance)}</td>
                        <td className={r.outstanding === 0 ? 'clear' : undefined}>{money(r.outstanding)}</td>
                        <td className={`left${r.tone ? ` sched-${r.tone}` : ''}`}>{r.remark}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td />
                      <td className="left">Total</td>
                      <td>{money(sum((r) => r.installment))}</td>
                      <td>{money(sum((r) => r.principal))}</td>
                      <td>{money(sum((r) => r.interest))}</td>
                      <td />
                      <td>{money(sum((r) => r.outstanding))}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
