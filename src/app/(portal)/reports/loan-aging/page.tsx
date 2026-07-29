// Loan Aging (user request 2026-07-24): overdue repayment buckets for BOTH
// directions — 应收 Fund OUT loans and 应付 Fund IN sources — plus a not-aged
// section for compounding / no-fixed-term positions below each table.
// Table styling mirrors Debtor Aging (user 2026-07-24: the MonthlyMatrix
// render wrapped labels, clashed backgrounds and overlapped glyphs).

import dayjs from 'dayjs'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import { fetchLoanAgingData, type AgingSide } from '@/lib/loan-aging-data'

export const dynamic = 'force-dynamic'

const BUCKETS = [
  { key: 'current', label: 'Due this month' },
  { key: 'm1', label: '1 month late' },
  { key: 'm2', label: '2 months late' },
  { key: 'm3', label: '3+ months late' },
] as const

function money(v: number) {
  return v ? <span className="num">{formatMoney(v)}</span> : <span className="num text-muted">—</span>
}

function AgingTable({ side }: { side: AgingSide }) {
  if (side.aged.length === 0) {
    return (
      <div className="border border-hairline rounded-md bg-surface p-6 text-center mb-4">
        <p className="font-serif italic text-ledger text-sm">Fully on track — nothing due or overdue. 🎉</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto mb-4">
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
          {side.aged.map((a) => (
            <tr key={a.key}>
              <td className="whitespace-nowrap">
                <span className="font-serif text-[15px] text-ink">{a.counterparty}</span>
                {a.source ? (
                  <span
                    className="ml-2 font-mono text-[10px] uppercase tracking-wider text-info border border-hairline rounded px-1.5 py-0.5"
                    title={`资金来源: ${a.source}`}
                  >
                    SC {a.source}
                  </span>
                ) : null}
                <span className="font-mono text-[11px] text-graphite ml-2">{a.detail}</span>
              </td>
              {BUCKETS.map((b) => (
                <td key={b.key} className="num">{money(a.buckets[b.key])}</td>
              ))}
              <td className="num font-semibold">{formatMoney(a.buckets.total)}</td>
            </tr>
          ))}
          <tr className="bg-surface-2">
            <td className="font-sans font-medium text-ink">Total</td>
            {BUCKETS.map((b) => (
              <td key={b.key} className="num font-semibold">{money(side.totals[b.key])}</td>
            ))}
            <td className="num font-semibold">{formatMoney(side.totals.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function NoTermTable({ side }: { side: AgingSide }) {
  if (side.noTerm.length === 0) return null
  return (
    <div className="mb-2">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-serif italic text-graphite text-sm">
          无固定期限 / 利滚利 · not aged(没有到期日,只列余额)
        </h3>
        <span className="font-mono text-[11px] text-graphite">
          OUTSTANDING {formatMoney(side.noTermOutstanding)}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Counterparty</th>
              <th className="num">Outstanding</th>
              <th className="num">Monthly interest</th>
            </tr>
          </thead>
          <tbody>
            {side.noTerm.map((n) => (
              <tr key={n.key}>
                <td className="whitespace-nowrap">
                  <span className="font-serif text-[15px] text-ink">{n.counterparty}</span>
                  {n.source ? (
                    <span
                      className="ml-2 font-mono text-[10px] uppercase tracking-wider text-info border border-hairline rounded px-1.5 py-0.5"
                      title={`资金来源: ${n.source}`}
                    >
                      SC {n.source}
                    </span>
                  ) : null}
                  <span className="font-mono text-[11px] text-graphite ml-2">{n.detail}</span>
                </td>
                <td className="num">{formatMoney(n.outstanding)}</td>
                <td className="num">{money(n.monthlyInterest)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default async function LoanAgingPage() {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const data = await fetchLoanAgingData(supabase)
  const asOfLabel = dayjs(`${data.asOfYM}-01`).format('MMMM YYYY')

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>III.</em> REPORTS · LOAN AGING · AS OF {asOfLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Loan Aging</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            按还款排程逐期对账 · flat amortisation · 付款按最旧一期先冲(FIFO)· all amounts RM
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
          <h2>应收 · To collect — Fund OUT loans</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {data.collect.aged.length} WITH DUES · {data.collect.noTerm.length} NOT AGED
          </span>
        </div>
        <AgingTable side={data.collect} />
        <NoTermTable side={data.collect} />
      </section>

      <section className="mb-12">
        <div className="sect-head">
          <h2>应付 · To repay — Fund IN sources</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {data.repay.aged.length} WITH DUES · {data.repay.noTerm.length} NOT AGED
          </span>
        </div>
        <AgingTable side={data.repay} />
        <NoTermTable side={data.repay} />
      </section>

      <p className="font-serif italic text-muted text-xs max-w-3xl">
        本月才放款/收款的,首期下个月才到期,不会出现在这里;完全没拖欠的 loan 也不显示 — 这是一张「找问题」的报表。
      </p>
    </div>
  )
}
