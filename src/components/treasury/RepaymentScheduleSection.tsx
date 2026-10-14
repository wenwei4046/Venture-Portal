import type { ReactNode } from 'react'
import dayjs from 'dayjs'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import type { RepaymentPlan } from '@/lib/repayment-plan'

// The Repayment schedule on a fund source's and a loan's page (2026-10-09,
// the user's Claude Design handoff — it replaces the repayment history, with
// Balance / Outstanding / Remark columns). The figures come from
// lib/repayment-plan; the payments themselves fold away underneath, where a
// loan's repayment can still be reversed.

const money = (n: number | null) => (n === null ? '—' : formatMoneyBare(n))

/** What the schedule's head says beside its name: how far it is paid, or that it has no fixed term. */
export function scheduleCount(plan: RepaymentPlan): string {
  return plan.kind === 'open'
    ? `NO FIXED TERM · ${plan.rows.length} ${plan.rows.length === 1 ? 'MONTH' : 'MONTHS'} TO DATE`
    : plan.kind === 'fixed'
      ? `PAID ${plan.paidCount} OF ${plan.months ?? plan.rows.length} · OUTSTANDING ${formatMoney(plan.outstandingDue)}`
      : 'NO SCHEDULE'
}

export default function RepaymentScheduleSection({
  plan,
  recorded,
  cancelled = false,
  bare = false,
}: {
  plan: RepaymentPlan
  /** The payments as recorded, folded under the schedule. */
  recorded?: { count: number; content: ReactNode }
  cancelled?: boolean
  /** Inside a full page's card (2026-10-15, D06): the card's strip names it and says the count. */
  bare?: boolean
}) {
  const count = scheduleCount(plan)
  const sum = (pick: (r: RepaymentPlan['rows'][number]) => number | null) => plan.rows.reduce((s, r) => s + (pick(r) ?? 0), 0)

  const Wrap = bare ? 'div' : 'section'
  return (
    <Wrap className={bare ? 'sched' : 'mb-9 sched'}>
      {bare ? null : (
        <div className="sect-head">
          <h2>Repayment schedule</h2>
          <span className="rule" aria-hidden />
          <span className="count">{count}</span>
        </div>
      )}
      {plan.rows.length === 0 ? (
        <div className="border border-hairline rounded-md bg-surface p-5 text-center">
          <p className="font-sans text-sm text-graphite">{cancelled ? 'Cancelled — no schedule.' : 'No installments yet.'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="ledger-table w-full sched-table">
            <thead>
              <tr>
                <th className="text-right right">No.</th>
                <th>Date</th>
                <th className="text-right right">Installment</th>
                <th className="text-right right m-hide">Principal</th>
                <th className="text-right right m-hide">Interest</th>
                <th className="text-right right m-hide">Balance</th>
                <th className="text-right right">Outstanding</th>
                <th className="m-hide">Remark</th>
              </tr>
            </thead>
            <tbody>
              {plan.rows.map((r) => (
                <tr key={r.no}>
                  <td className="num">{r.no}</td>
                  <td className="whitespace-nowrap">{dayjs(r.due).format('D MMM YYYY')}</td>
                  <td className="num">{money(r.installment)}</td>
                  <td className="num m-hide">{money(r.principal)}</td>
                  <td className="num m-hide">{money(r.interest)}</td>
                  <td className="num m-hide">{money(r.balance)}</td>
                  <td className={`num${r.outstanding === 0 ? ' sched-clear' : ''}`}>{money(r.outstanding)}</td>
                  <td className="m-hide">
                    {r.remark ? <span className={r.tone ? `sched-${r.tone}` : undefined}>{r.remark}</span> : <span className="text-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td />
                <td>Total</td>
                <td className="num">{money(sum((r) => r.installment))}</td>
                <td className="num m-hide">{money(sum((r) => r.principal))}</td>
                <td className="num m-hide">{money(sum((r) => r.interest))}</td>
                <td className="m-hide" />
                <td className="num">{money(sum((r) => r.outstanding))}</td>
                <td className="m-hide" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {/* No line under the table on how to read it (2026-10-12, the user: the
          descriptions make the view too messy) — the head's count says a deal
          has no fixed term. */}
      {recorded ? (
        <details className="sched-recorded">
          <summary>Repayments recorded · {recorded.count}</summary>
          <div className="mt-3">{recorded.content}</div>
        </details>
      ) : null}
    </Wrap>
  )
}
