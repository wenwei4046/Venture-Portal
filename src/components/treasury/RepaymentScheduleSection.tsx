import { Fragment, type ReactNode } from 'react'
import dayjs from 'dayjs'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import type { RepaymentPlan } from '@/lib/repayment-plan'

// The Repayment schedule on a fund source's and a loan's page (2026-10-09,
// the user's Claude Design handoff — it replaces the repayment history, with
// Balance / Outstanding / Remark columns). The figures come from
// lib/repayment-plan; the payments themselves fold away underneath, where a
// loan's repayment can still be reversed. A 利滚利 deal's (2026-10-24, the
// user's tidied LO#7 — "照整理后的样子做"): Due / Paid / To balance / Balance /
// Overdue, a line where its terms change, and a total that adds up. Every
// schedule (2026-10-26 — fund in "也需要卡片，和fund out 一样") opens on four
// figures: overdue now, owed now, paid to date, the next installment.

const money = (n: number | null) => (n === null ? '—' : formatMoneyBare(n))
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const monthWords = (ym: string) => dayjs(`${ym}-01`).format('MMM YYYY')

/** What the schedule's head says beside its name: how far it is paid, or that it has no fixed term — and what is overdue. */
export function scheduleCount(plan: RepaymentPlan): string {
  return plan.kind === 'open'
    ? `NO FIXED TERM · ${plan.rows.length} ${plan.rows.length === 1 ? 'MONTH' : 'MONTHS'} TO DATE${plan.overdue > 0.005 ? ` · OVERDUE ${formatMoney(plan.overdue)}` : ''}`
    : plan.kind === 'fixed'
      ? `PAID ${plan.paidCount} OF ${plan.months ?? plan.rows.length} · OUTSTANDING ${formatMoney(plan.outstandingDue)}`
      : 'NO SCHEDULE'
}

/**
 * The four figures over every schedule (2026-10-26 — the user: fund in "也需要卡片，和fund out 一样", every schedule "是",
 * the fourth "改成 next installment"): overdue now, owed now, paid to date, the next installment.
 */
function ScheduleFacts({ plan }: { plan: RepaymentPlan }) {
  const c = plan.compound
  const last = plan.rows[plan.rows.length - 1]
  const r2 = (n: number) => Math.round(n * 100) / 100
  // Owed now: a 利滚利 deal's whole balance; else the principal still owed and the interest already due but unpaid.
  const unpaidInterest = r2(Math.max(0, plan.rows.filter((r) => !plan.next || r.due < plan.next.due).reduce((s, r) => s + r.interest, 0) - plan.interestPaid))
  const next = plan.next ?? null
  const facts: Array<{ key: string; label: string; value: string; sub: string; bad?: boolean }> = [
    {
      key: 'overdue',
      label: 'Overdue now',
      value: formatMoney(plan.overdue),
      sub: plan.overdueSince ? `since ${dayjs(plan.overdueSince).format('D MMM YYYY')} · ${plural(plan.overdueDays, 'day', 'days')}` : 'nothing past its day',
      bad: plan.overdue > 0.005,
    },
    c
      ? { key: 'owed', label: 'Owed now', value: formatMoney(c.owedNow), sub: last ? `balance after ${monthWords(last.ym)}` : '' }
      : {
          key: 'owed',
          label: 'Owed now',
          value: formatMoney(r2(plan.principalOwed + unpaidInterest)),
          sub: `principal ${formatMoneyBare(plan.principalOwed)} + interest ${formatMoneyBare(unpaidInterest)}`,
        },
    {
      key: 'paid',
      label: 'Paid to date',
      value: formatMoney(r2(plan.principalPaid + plan.interestPaid)),
      sub: `principal ${formatMoneyBare(plan.principalPaid)} + interest ${formatMoneyBare(plan.interestPaid)}`,
    },
    next
      ? {
          key: 'next',
          label: 'Next installment',
          value: formatMoney(next.amount),
          sub: `${dayjs(next.due).format('D MMM YYYY')} · ${next.principal > 0.005 ? `principal ${formatMoneyBare(next.principal)} + interest ${formatMoneyBare(next.interest)}` : 'interest'}`,
        }
      : { key: 'next', label: 'Next installment', value: '—', sub: 'nothing more falls due' },
  ]
  return (
    <div className="sched-facts">
      {facts.map((f) => (
        <div key={f.key} className="sched-fact" data-bad={f.bad ? 'true' : undefined}>
          <div className="sched-fact-k">{f.label}</div>
          <div className="sched-fact-v">{f.value}</div>
          <div className="sched-fact-s">{f.sub}</div>
        </div>
      ))}
    </div>
  )
}

/** A 利滚利 deal's table: a line where its terms change, Due = Paid + To balance + Overdue. */
function CompoundTable({ plan }: { plan: RepaymentPlan }) {
  const c = plan.compound!
  const breakAt = new Map(c.breaks.map((b) => [b.no, b]))
  const total = (pick: (r: RepaymentPlan['rows'][number]) => number) => Math.round(plan.rows.reduce((s, r) => s + pick(r), 0) * 100) / 100
  const due = total((r) => r.installment)
  const paid = total((r) => r.paid ?? 0)
  const toBalance = total((r) => r.toBalance ?? 0)
  const addsUp = Math.abs(due - paid - toBalance - plan.overdue) < 0.01
  return (
    <>
      <div className="overflow-x-auto">
        <table className="ledger-table w-full sched-table">
          <thead>
            <tr>
              <th className="text-right right">No.</th>
              <th>Date</th>
              <th className="text-right right">Due</th>
              <th className="text-right right m-hide">Paid</th>
              <th className="text-right right m-hide">To balance</th>
              <th className="text-right right m-hide">Balance</th>
              <th className="text-right right">Overdue</th>
              <th className="m-hide">Remark</th>
            </tr>
          </thead>
          <tbody>
            {plan.rows.map((r) => {
              const b = breakAt.get(r.no)
              return (
                <Fragment key={r.no}>
                  {b ? (
                    <tr className="sched-break">
                      <td colSpan={8}>
                        <b>{b.head}</b> · {b.rest}
                      </td>
                    </tr>
                  ) : null}
                  <tr>
                    <td className="num">{r.no}</td>
                    <td className="whitespace-nowrap">{dayjs(r.due).format('D MMM YYYY')}</td>
                    <td className="num">{money(r.installment)}</td>
                    <td className="num m-hide">{r.paid ? money(r.paid) : <span className="text-muted">—</span>}</td>
                    <td className="num m-hide">{r.toBalance ? <span className="sched-alert">{money(r.toBalance)}</span> : <span className="text-muted">—</span>}</td>
                    <td className="num m-hide">{money(r.balance)}</td>
                    <td className="num">{r.late ? <span className="sched-danger">{money(r.outstanding)}</span> : <span className="text-muted">—</span>}</td>
                    <td className="m-hide">
                      {r.remark ? <span className={r.tone ? `sched-${r.tone}` : undefined}>{r.remark}</span> : <span className="text-muted">—</span>}
                    </td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td>Total</td>
              <td className="num">{money(due)}</td>
              <td className="num m-hide">{money(paid)}</td>
              <td className="num m-hide">{money(toBalance)}</td>
              <td className="m-hide" />
              <td className="num">{money(plan.overdue)}</td>
              <td className="m-hide sched-total-note">{addsUp ? 'Due = Paid + To balance + Overdue' : null}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  )
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
      {plan.rows.length > 0 ? <ScheduleFacts plan={plan} /> : null}
      {plan.rows.length === 0 ? (
        <div className="border border-hairline rounded-md bg-surface p-5 text-center">
          <p className="font-sans text-sm text-graphite">{cancelled ? 'Cancelled — no schedule.' : 'No installments yet.'}</p>
        </div>
      ) : plan.compound ? (
        <CompoundTable plan={plan} />
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
