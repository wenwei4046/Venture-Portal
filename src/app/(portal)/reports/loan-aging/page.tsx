// Loan Monitor (user redefinition 2026-07-24, replaces the months-late aging):
//   区1 本月应收/应付 — agreed-schedule positions due THIS month that are not
//        yet settled; a row disappears once collected/paid in full this month.
//   区2 Outstanding 总览 — every open balance, split 定好日期 vs 还没定好.
// The agreed start (还款起始月) is set per position on its detail page;
// unset = defaults to the month after disbursement/receipt.

import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { formatMoney, formatMoneyBare } from '@/lib/utils'
import { fetchLoanMonitorData, type MonitorSide } from '@/lib/loan-monitor'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import { FindRow, LoanFindProvider } from './_components/LoanFind'

export const dynamic = 'force-dynamic'

// The tables' figures are bare, as on every report (2026-10-10, the handoff).
function money(v: number) {
  return v ? <span className="num">{formatMoneyBare(v)}</span> : <span className="num text-muted">—</span>
}

function SourceBadge({ source }: { source?: string | null }) {
  if (!source) return null
  return (
    <span
      className="ml-2 font-mono text-[10px] uppercase tracking-wider text-info border border-hairline rounded px-1.5 py-0.5"
      title={`Source of capital: ${source}`}
    >
      SC {source}
    </span>
  )
}

// Days late (2026-10-09, the Finance revamp handoff): each unpaid installment
// from its own due day — not due yet, 1–30, 31–90 or over 90 days.
const BUCKETS = [
  { key: 'notDue', label: 'Not due' },
  { key: 'd30', label: '1–30 days' },
  { key: 'd90', label: '31–90 days' },
  { key: 'd90plus', label: '90+ days' },
] as const

function DueTable({ side, verb, allLabel }: { side: MonitorSide; verb: 'collected' | 'paid'; allLabel: string }) {
  if (side.due.length === 0) {
    return (
      <div className="border border-hairline rounded-md bg-surface p-6 text-center mb-6">
        <p className="font-serif italic text-ledger text-sm">All {verb} — nothing overdue 🎉</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto mb-6">
      <table className="ledger-table">
        <thead>
          <tr>
            <th>Counterparty</th>
            {BUCKETS.map((b) => (
              <th key={b.key} className="num">{b.label}</th>
            ))}
            <th className="num">Total due</th>
          </tr>
        </thead>
        <tbody>
          {side.due.map((d) => (
            <FindRow key={d.key} name={d.counterparty}>
              <td className="whitespace-nowrap">
                <span className="font-medium text-ink">{d.counterparty}</span>
                <SourceBadge source={d.source} />
                <span className="font-mono text-[11px] text-graphite ml-2">{d.detail}</span>
              </td>
              {BUCKETS.map((b) => (
                <td key={b.key} className="num">{money(d.days[b.key])}</td>
              ))}
              <td className="num font-semibold">{formatMoneyBare(d.days.total)}</td>
            </FindRow>
          ))}
          {/* The handoff's navy "All" row (2026-10-09). */}
          <tr className="rpt-all">
            <td>{allLabel}</td>
            {BUCKETS.map((b) => (
              <td key={b.key} className="num">{money(side.dueDaysTotal[b.key])}</td>
            ))}
            <td className="num">{formatMoneyBare(side.dueDaysTotal.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function OutstandingTables({ side }: { side: MonitorSide }) {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="font-serif italic text-graphite text-sm">Fixed schedule</h3>
          <span className="font-mono text-[11px] text-graphite">SUBTOTAL {formatMoney(side.scheduledTotal)}</span>
        </div>
        {side.scheduled.length === 0 ? (
          <p className="font-serif italic text-muted text-sm">None.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Counterparty</th>
                  <th className="num">Starts</th>
                  <th className="num">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {side.scheduled.map((o) => (
                  <FindRow key={o.key} name={o.counterparty}>
                    <td className="whitespace-nowrap">
                      <span className="font-medium text-ink">{o.counterparty}</span>
                      <SourceBadge source={o.source} />
                      <span className="font-mono text-[11px] text-graphite ml-2">{o.detail}</span>
                    </td>
                    <td className="num font-mono text-[11px] text-graphite">{o.startLabel}</td>
                    <td className="num font-semibold">{formatMoneyBare(o.outstanding)}</td>
                  </FindRow>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="font-serif italic text-graphite text-sm">No fixed term / compounding</h3>
          <span className="font-mono text-[11px] text-graphite">SUBTOTAL {formatMoney(side.noTermTotal)}</span>
        </div>
        {side.noTerm.length === 0 ? (
          <p className="font-serif italic text-muted text-sm">None.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Counterparty</th>
                  <th className="num">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {side.noTerm.map((o) => (
                  <FindRow key={o.key} name={o.counterparty}>
                    <td className="whitespace-nowrap">
                      <span className="font-medium text-ink">{o.counterparty}</span>
                      <SourceBadge source={o.source} />
                      <span className="font-mono text-[11px] text-graphite ml-2">{o.detail}</span>
                    </td>
                    <td className="num font-semibold">{formatMoneyBare(o.outstanding)}</td>
                  </FindRow>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="font-mono text-[11.5px] text-graphite tracking-[0.02em] font-medium">
        GRAND TOTAL OUTSTANDING <span className="text-num-ink">{formatMoney(side.grandTotal)}</span>
      </p>
    </div>
  )
}

export default async function LoanMonitorPage() {
  await requirePermission('reports')
  const supabase = await createClient()

  const data = await fetchLoanMonitorData(supabase)
  const monthLabel = dayjs(`${data.currentYM}-01`).format('MMMM YYYY')

  // On the sheet (2026-10-09, the user's Claude Design handoff): cards for
  // both sides, the exports as the sheet's buttons, each aging closing on a
  // navy "All" row.
  // The handoff's four cards (2026-10-10): the loans out, then what is not
  // due and what is 1–30 / 31–90 days late, each naming the borrower owing most.
  const collectNames = [
    ...new Set([...data.collect.due, ...data.collect.scheduled, ...data.collect.noTerm].map((r) => r.counterparty)),
  ]
  const topIn = (key: 'd30' | 'd90') =>
    [...data.collect.due].filter((d) => d.days[key] > 0.005).sort((x, y) => y.days[key] - x.days[key])[0]?.counterparty ?? 'None'
  const allNames = [
    ...new Set(
      [data.collect, data.repay].flatMap((s) => [...s.due, ...s.scheduled, ...s.noTerm].map((r) => r.counterparty)),
    ),
  ]

  return (
    <div>
      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · LOAN AGING · {monthLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Loan Aging</h1>
          <p className="page-sub">
            Scheduled by the agreed start month: unpaid installments by days late
            from each deal&apos;s own due day (settled months drop off) · Outstanding overview below ·
            set the start month on each position&apos;s detail page; unset
            defaults to the month after disbursement/receipt
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <a href="/reports/loan-aging/export?format=xlsx&view=aging" className="btn-quiet-sheet">
            Excel
          </a>
          <a href="/reports/loan-aging/export?format=pdf&view=aging" className="btn-quiet-sheet">
            PDF
          </a>
          <a href="/reports/loan-aging/export?format=xlsx&view=outstanding" className="btn-quiet-sheet">
            Outstanding Excel
          </a>
          <a href="/reports/loan-aging/export?format=pdf&view=outstanding" className="btn-quiet-sheet">
            Outstanding PDF
          </a>
        </div>
      </div>

      <StatCards label="Loan aging">
        <StatCard
          label="Loans outstanding"
          value={formatMoney(data.collect.grandTotal)}
          icon="send"
          tone="primary"
          note={`${collectNames.length} ${collectNames.length === 1 ? 'borrower' : 'borrowers'}`}
        />
        <StatCard label="Not due" value={formatMoney(data.collect.dueDaysTotal.notDue)} icon="check" note="On schedule" />
        <StatCard
          label="1–30 days"
          value={formatMoney(data.collect.dueDaysTotal.d30)}
          icon="clock"
          tone={data.collect.dueDaysTotal.d30 > 0 ? 'danger' : 'default'}
          note={topIn('d30')}
        />
        <StatCard
          label="31–90 days"
          value={formatMoney(data.collect.dueDaysTotal.d90)}
          icon="alert"
          tone={data.collect.dueDaysTotal.d90 > 0 ? 'danger' : 'default'}
          note={topIn('d90')}
        />
      </StatCards>

      <LoanFindProvider names={allNames}>
      <section className="mb-12">
        <div className="sect-head">
          <h2>To Collect · aging — Fund OUT</h2>
          <span className="rule" aria-hidden />
          <span className="count">{data.collect.due.length} UNSETTLED</span>
        </div>
        <DueTable side={data.collect} verb="collected" allLabel="All borrowers" />
      </section>

      <section className="mb-12">
        <div className="sect-head">
          <h2>To Repay · aging — Fund IN</h2>
          <span className="rule" aria-hidden />
          <span className="count">{data.repay.due.length} UNSETTLED</span>
        </div>
        <DueTable side={data.repay} verb="paid" allLabel="All lenders" />
      </section>

      <section className="mb-12">
        <div className="sect-head">
          <h2>Outstanding · To Collect — Fund OUT</h2>
          <span className="rule" aria-hidden />
          <span className="count">{formatMoney(data.collect.grandTotal)}</span>
        </div>
        <OutstandingTables side={data.collect} />
      </section>

      <section className="mb-12">
        <div className="sect-head">
          <h2>Outstanding · To Repay — Fund IN</h2>
          <span className="rule" aria-hidden />
          <span className="count">{formatMoney(data.repay.grandTotal)}</span>
        </div>
        <OutstandingTables side={data.repay} />
      </section>
      </LoanFindProvider>
    </div>
  )
}
