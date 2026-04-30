import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import {
  fetchIncomeStatement,
  startOfMonth,
  endOfMonth,
  SEGMENT_LABEL,
} from '@/lib/cfo-reports'
import dayjs from 'dayjs'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{ from?: string; to?: string; period?: string }>
}

export default async function IncomeStatementPage({ searchParams }: Props) {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { from: rawFrom, to: rawTo, period } = await searchParams
  const from = rawFrom ?? startOfMonth(period)
  const to = rawTo ?? endOfMonth(period ?? from)
  const periodLabel = formatPeriodLabel(from, to)

  const stmt = await fetchIncomeStatement(supabase, { from, to })

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · INCOME STATEMENT · {periodLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Income Statement</h1>
        </div>
        <form className="shrink-0">
          <input
            type="month"
            name="period"
            defaultValue={dayjs(from).format('YYYY-MM')}
            className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
          />
        </form>
      </div>

      <p className="font-serif italic text-muted text-sm mb-8 max-w-3xl">
        Per-department P&amp;L plus group-level overhead. Each dept&apos;s revenue
        comes from invoices billed in that period; cost is what the dept pool
        actually spent. General expenses sit at the group level.
      </p>

      <div className="max-w-3xl space-y-10">
        {/* Per-dept P&L */}
        <section>
          <h2 className="font-serif text-xl text-ink mb-4">Department P&amp;L</h2>
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Department</th>
                <th className="right">Revenue</th>
                <th className="right">Cost</th>
                <th className="right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {stmt.perDept.map((d) => (
                <tr key={d.segment}>
                  <td className="font-serif text-md text-ink">{SEGMENT_LABEL[d.segment]}</td>
                  <td className="num text-ledger">{formatMoney(d.revenue)}</td>
                  <td className="num"><span className="neg">{formatMoney(-d.cost)}</span></td>
                  <td className={`num font-medium ${d.margin >= 0 ? 'text-ledger' : 'text-danger'}`}>
                    {formatMoney(d.margin)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-hairline">
                <td className="font-serif italic text-ink font-medium">Group total</td>
                <td className="num text-ledger font-semibold">{formatMoney(stmt.groupRevenue)}</td>
                <td className="num"><span className="neg font-semibold">{formatMoney(-stmt.groupDeptCost)}</span></td>
                <td className="num font-semibold">{formatMoney(stmt.groupRevenue - stmt.groupDeptCost)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* Group general expenses */}
        <section>
          <h2 className="font-serif text-xl text-ink mb-2">General expenses</h2>
          <p className="font-serif italic text-muted text-xs mb-4">
            Group-level — rent, utility, statutory, audit, software, mgmt overhead.
          </p>
          {stmt.groupGeneral.length === 0 ? (
            <p className="font-serif italic text-muted text-sm">No general expenses booked this period.</p>
          ) : (
            <table className="ledger-table">
              <tbody>
                {stmt.groupGeneral.map((l) => (
                  <tr key={l.label}>
                    <td>{l.label}</td>
                    <td className="num"><span className="neg">{formatMoney(-l.amount)}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-hairline">
                  <td className="font-serif italic text-ink font-medium">Total general</td>
                  <td className="num font-semibold"><span className="neg">{formatMoney(-stmt.groupGeneralTotal)}</span></td>
                </tr>
              </tfoot>
            </table>
          )}
        </section>

        {/* Group net profit */}
        <div className="border-t-2 border-hairline pt-6">
          <div className="flex items-baseline justify-between">
            <span className="font-serif text-lg text-ink">Group net profit</span>
            <span className={`font-serif text-2xl font-semibold tabular ${stmt.groupNetProfit >= 0 ? 'text-ledger' : 'text-danger'}`}>
              {formatMoney(stmt.groupNetProfit)}
            </span>
          </div>
          <p className="font-serif italic text-muted text-xs mt-2">
            Group revenue − dept costs − general expenses.
          </p>
        </div>
      </div>
    </div>
  )
}

function formatPeriodLabel(from: string, to: string): string {
  const dFrom = dayjs(from)
  const dTo = dayjs(to)
  const wholeMonth = dFrom.startOf('month').isSame(dFrom, 'day')
                     && dTo.endOf('month').isSame(dTo, 'day')
                     && dFrom.isSame(dTo, 'month')
  if (wholeMonth) return dFrom.format('MMMM YYYY')
  return `${dFrom.format('D MMM')} → ${dTo.format('D MMM YYYY')}`
}
