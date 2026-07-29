// Loan Monitor (user redefinition 2026-07-24, replaces the months-late aging):
//   区1 本月应收/应付 — agreed-schedule positions due THIS month that are not
//        yet settled; a row disappears once collected/paid in full this month.
//   区2 Outstanding 总览 — every open balance, split 定好日期 vs 还没定好.
// The agreed start (还款起始月) is set per position on its detail page;
// unset = defaults to the month after disbursement/receipt.

import dayjs from 'dayjs'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import { fetchLoanMonitorData, type MonitorSide } from '@/lib/loan-monitor'

export const dynamic = 'force-dynamic'

function money(v: number) {
  return v ? <span className="num">{formatMoney(v)}</span> : <span className="num text-muted">—</span>
}

function SourceBadge({ source }: { source?: string | null }) {
  if (!source) return null
  return (
    <span
      className="ml-2 font-mono text-[10px] uppercase tracking-wider text-info border border-hairline rounded px-1.5 py-0.5"
      title={`资金来源: ${source}`}
    >
      SC {source}
    </span>
  )
}

function DueTable({ side, verb }: { side: MonitorSide; verb: '收' | '付' }) {
  if (side.due.length === 0) {
    return (
      <div className="border border-hairline rounded-md bg-surface p-6 text-center mb-6">
        <p className="font-serif italic text-ledger text-sm">本月全部{verb}清 — 没有未{verb}项 🎉</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto mb-6">
      <table className="ledger-table">
        <thead>
          <tr>
            <th>Counterparty</th>
            <th className="num">本月该{verb}</th>
            <th className="num">本月已{verb}</th>
            <th className="num">还差</th>
          </tr>
        </thead>
        <tbody>
          {side.due.map((d) => (
            <tr key={d.key}>
              <td className="whitespace-nowrap">
                <span className="font-serif text-[15px] text-ink">{d.counterparty}</span>
                <SourceBadge source={d.source} />
                <span className="font-mono text-[11px] text-graphite ml-2">{d.detail}</span>
              </td>
              <td className="num">{formatMoney(d.dueAmount)}</td>
              <td className="num">{money(d.paidThisMonth)}</td>
              <td className="num font-semibold">{formatMoney(d.shortfall)}</td>
            </tr>
          ))}
          <tr className="bg-surface-2">
            <td className="font-sans font-medium text-ink">Total</td>
            <td className="num font-semibold">{formatMoney(side.dueTotal.dueAmount)}</td>
            <td className="num font-semibold">{money(side.dueTotal.paidThisMonth)}</td>
            <td className="num font-semibold">{formatMoney(side.dueTotal.shortfall)}</td>
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
          <h3 className="font-serif italic text-graphite text-sm">定好日期的 · fixed schedule</h3>
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
                  <th className="num">还款起始</th>
                  <th className="num">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {side.scheduled.map((o) => (
                  <tr key={o.key}>
                    <td className="whitespace-nowrap">
                      <span className="font-serif text-[15px] text-ink">{o.counterparty}</span>
                      <SourceBadge source={o.source} />
                      <span className="font-mono text-[11px] text-graphite ml-2">{o.detail}</span>
                    </td>
                    <td className="num font-mono text-[11px] text-graphite">{o.startLabel}</td>
                    <td className="num font-semibold">{formatMoney(o.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="font-serif italic text-graphite text-sm">还没定好的 · no fixed term / 利滚利</h3>
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
                  <tr key={o.key}>
                    <td className="whitespace-nowrap">
                      <span className="font-serif text-[15px] text-ink">{o.counterparty}</span>
                      <SourceBadge source={o.source} />
                      <span className="font-mono text-[11px] text-graphite ml-2">{o.detail}</span>
                    </td>
                    <td className="num font-semibold">{formatMoney(o.outstanding)}</td>
                  </tr>
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
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const data = await fetchLoanMonitorData(supabase)
  const monthLabel = dayjs(`${data.currentYM}-01`).format('MMMM YYYY')

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>III.</em> REPORTS · LOAN MONITOR · {monthLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Loan Monitor</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            本月该收/该付而未清的排在上面(清了就消失)· Outstanding 总览在下面 ·
            还款起始月在各笔的详情页设定,没设的默认放款/收款次月起
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/reports/loan-aging/export?format=xlsx"
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            Excel
          </a>
          <a
            href="/reports/loan-aging/export?format=pdf"
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            PDF
          </a>
        </div>
      </div>

      <section className="mb-12">
        <div className="sect-head">
          <h2>本月应收 · To collect this month — Fund OUT</h2>
          <span className="rule" aria-hidden />
          <span className="count">{data.collect.due.length} UNSETTLED</span>
        </div>
        <DueTable side={data.collect} verb="收" />
      </section>

      <section className="mb-12">
        <div className="sect-head">
          <h2>本月应付 · To repay this month — Fund IN</h2>
          <span className="rule" aria-hidden />
          <span className="count">{data.repay.due.length} UNSETTLED</span>
        </div>
        <DueTable side={data.repay} verb="付" />
      </section>

      <section className="mb-12">
        <div className="sect-head">
          <h2>Outstanding · 应收结欠 — Fund OUT</h2>
          <span className="rule" aria-hidden />
          <span className="count">{formatMoney(data.collect.grandTotal)}</span>
        </div>
        <OutstandingTables side={data.collect} />
      </section>

      <section className="mb-12">
        <div className="sect-head">
          <h2>Outstanding · 应付结欠 — Fund IN</h2>
          <span className="rule" aria-hidden />
          <span className="count">{formatMoney(data.repay.grandTotal)}</span>
        </div>
        <OutstandingTables side={data.repay} />
      </section>
    </div>
  )
}
