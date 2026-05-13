import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import {
  fetchIncomeStatement,
  startOfMonth,
  endOfMonth,
  type PoolPnl,
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
        One section per pool — revenue less expense equals the pool margin. The
        Venture Pool includes treasury interest (loan interest in / fund-source
        interest out). Loan and deposit <em>principal</em> never appear here —
        they sit on the Balance Sheet.
      </p>

      <div className="max-w-3xl space-y-12">
        {stmt.pools.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">
              No revenue or expense activity in this period. Issue invoices or pay
              expense vouchers to populate the income statement.
            </p>
          </div>
        ) : (
          stmt.pools.map((p) => (
            <PoolBlock key={p.pool} pool={p} showTreasuryNote={p.pool === 'venture_pool' && stmt.treasury.net !== 0} />
          ))
        )}

        {/* ─── Summary ─── */}
        <section className="border-t-2 border-hairline pt-6">
          <div className="sect-head">
            <h2>Summary</h2>
            <span className="rule" aria-hidden />
            <span className="count">ALL POOLS</span>
          </div>
          <table className="ledger-table">
            <tbody>
              {stmt.pools.map((p) => (
                <tr key={p.pool}>
                  <td>{p.poolLabel} <span className="font-mono text-muted text-xs ml-1">margin</span></td>
                  <td className="num">
                    {p.margin < 0 ? <span className="neg">{formatMoney(p.margin)}</span> : formatMoney(p.margin)}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-hairline">
                <td className="text-graphite">Group revenue</td>
                <td className="num text-ledger">{formatMoney(stmt.groupRevenue)}</td>
              </tr>
              <tr>
                <td className="text-graphite">Group expense</td>
                <td className="num"><span className="neg">{formatMoney(-stmt.groupExpense)}</span></td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-hairline">
                <td className="font-serif italic text-ink font-medium">Group net profit</td>
                <td className={`num ${stmt.groupNetProfit >= 0 ? 'text-ledger' : 'text-danger'}`}>
                  <span className={`font-serif text-2xl font-semibold tabular ${stmt.groupNetProfit >= 0 ? 'text-ledger' : 'text-danger'}`}>
                    {formatMoney(stmt.groupNetProfit)}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
      </div>
    </div>
  )
}

function PoolBlock({ pool, showTreasuryNote }: { pool: PoolPnl; showTreasuryNote: boolean }) {
  return (
    <section>
      <div className="sect-head">
        <h2>{pool.poolLabel}</h2>
        <span className="rule" aria-hidden />
        <span className={`count ${pool.margin >= 0 ? 'text-ledger' : 'text-danger'}`}>
          MARGIN {formatMoney(pool.margin)}
        </span>
      </div>

      {showTreasuryNote ? (
        <p className="font-serif italic text-muted text-xs mb-3">incl. loan interest</p>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
        {/* Revenue */}
        <div>
          <h3 className="font-serif italic text-accent text-sm mb-2">Revenue</h3>
          {pool.revenueLines.length === 0 ? (
            <p className="font-serif italic text-muted text-xs">No revenue.</p>
          ) : (
            <table className="ledger-table">
              <tbody>
                {pool.revenueLines.map((l) => (
                  <tr key={l.label}>
                    <td className="text-sm">{l.label}</td>
                    <td className="num text-ledger">
                      {l.amount < 0 ? <span className="neg">{formatMoney(l.amount)}</span> : formatMoney(l.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-hairline">
                  <td className="font-serif italic text-graphite text-sm">Subtotal</td>
                  <td className="num text-ledger font-semibold">{formatMoney(pool.revenue)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Expense */}
        <div>
          <h3 className="font-serif italic text-accent text-sm mb-2">Expense</h3>
          {pool.expenseLines.length === 0 ? (
            <p className="font-serif italic text-muted text-xs">No expenses.</p>
          ) : (
            <table className="ledger-table">
              <tbody>
                {pool.expenseLines.map((l) => (
                  <tr key={l.label}>
                    <td className="text-sm">{l.label}</td>
                    <td className="num"><span className="neg">{formatMoney(-l.amount)}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-hairline">
                  <td className="font-serif italic text-graphite text-sm">Subtotal</td>
                  <td className="num font-semibold"><span className="neg">{formatMoney(-pool.expense)}</span></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </section>
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
