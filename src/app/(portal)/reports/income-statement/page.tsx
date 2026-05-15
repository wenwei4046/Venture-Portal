import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import {
  fetchIncomeStatement,
  startOfMonth,
  endOfMonth,
  type PoolPnl,
  type Line,
  type IncomeStatement,
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
        <div className="shrink-0 flex items-center gap-3">
          <form>
            <input
              type="month"
              name="period"
              defaultValue={dayjs(from).format('YYYY-MM')}
              className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
            />
          </form>
          <Link
            href={`/reports/income-statement/export?format=xlsx&from=${from}&to=${to}`}
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            Export Excel
          </Link>
          <Link
            href={`/reports/income-statement/export?format=pdf&from=${from}&to=${to}`}
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            Export PDF
          </Link>
        </div>
      </div>

      <p className="font-serif italic text-muted text-sm mb-8 max-w-3xl">
        One block per pool. Gross profit = revenue − cost. Pool margin = gross
        profit + other income − operating expense. The Venture Pool folds
        treasury interest (loan interest in / fund-source interest out) into its
        revenue and expense lines. Loan and deposit <em>principal</em> never
        appear here — they sit on the Balance Sheet.
      </p>

      <div className="max-w-3xl space-y-12">
        {stmt.pools.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">
              No revenue or expense activity in this period. Issue invoices or
              pay expense vouchers to populate the income statement.
            </p>
          </div>
        ) : (
          stmt.pools.map((p) => (
            <PoolBlock
              key={p.pool}
              pool={p}
              showTreasuryNote={p.pool === 'venture_pool' && stmt.treasury.net !== 0}
            />
          ))
        )}

        {/* ─── Summary ─── */}
        {stmt.pools.length > 0 ? <SummaryBlock stmt={stmt} /> : null}
      </div>
    </div>
  )
}

// One block per pool — four inner ledger-tables (Revenue / Cost / Other Income
// / Expense) with a Gross Profit line between Cost and Other Income, and the
// pool margin at the bottom.
function PoolBlock({ pool, showTreasuryNote }: { pool: PoolPnl; showTreasuryNote: boolean }) {
  const empty =
    pool.revenueLines.length === 0 &&
    pool.costLines.length === 0 &&
    pool.otherIncomeLines.length === 0 &&
    pool.expenseLines.length === 0

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

      {empty ? (
        <p className="font-serif italic text-muted text-sm">No P&amp;L activity in this period.</p>
      ) : (
        <div className="space-y-6">
          <LineTable
            title="Revenue"
            lines={pool.revenueLines}
            subtotal={pool.revenue}
            tone="credit"
          />
          <LineTable
            title="Cost"
            lines={pool.costLines}
            subtotal={pool.cost}
            tone="debit"
          />

          {/* Gross Profit divider — between Cost and Other Income */}
          <table className="ledger-table">
            <tbody>
              <tr className="border-t-2 border-hairline">
                <td className="font-serif italic text-ink font-medium">Gross profit</td>
                <td className={`num tabular ${pool.grossProfit >= 0 ? 'text-num-ink' : 'text-danger'}`}>
                  <span className="font-serif text-lg font-semibold tabular tracking-[-0.01em]">
                    {pool.grossProfit < 0
                      ? <span className="neg">{formatMoney(pool.grossProfit)}</span>
                      : formatMoney(pool.grossProfit)}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>

          <LineTable
            title="Other income"
            lines={pool.otherIncomeLines}
            subtotal={pool.otherIncome}
            tone="credit"
          />
          <LineTable
            title="Expense"
            lines={pool.expenseLines}
            subtotal={pool.expense}
            tone="debit"
          />

          {/* Pool margin footer */}
          <table className="ledger-table">
            <tfoot>
              <tr className="border-t-2 border-hairline">
                <td className="font-serif italic text-ink font-medium">Pool margin</td>
                <td className={`num ${pool.margin >= 0 ? 'text-ledger' : 'text-danger'}`}>
                  <span className={`font-serif text-xl font-semibold tabular tracking-[-0.01em] ${pool.margin >= 0 ? 'text-ledger' : 'text-danger'}`}>
                    {formatMoney(pool.margin)}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}

function LineTable({
  title,
  lines,
  subtotal,
  tone,
}: {
  title: string
  lines: Line[]
  subtotal: number
  tone: 'credit' | 'debit'
}) {
  const isCredit = tone === 'credit'
  return (
    <div>
      <h3 className="font-serif italic text-accent text-sm mb-2">{title}</h3>
      {lines.length === 0 ? (
        <p className="font-serif italic text-muted text-xs">No {title.toLowerCase()}.</p>
      ) : (
        <table className="ledger-table">
          <tbody>
            {lines.map((l) => (
              <tr key={l.label}>
                <td className="text-sm">{l.label}</td>
                <td className={`num ${isCredit ? 'text-ledger' : ''}`}>
                  {isCredit
                    ? (l.amount < 0
                        ? <span className="neg">{formatMoney(l.amount)}</span>
                        : formatMoney(l.amount))
                    : <span className="neg">{formatMoney(-l.amount)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-hairline">
              <td className="font-serif italic text-graphite text-sm">Subtotal</td>
              <td className={`num font-semibold ${isCredit ? 'text-ledger' : ''}`}>
                {isCredit
                  ? formatMoney(subtotal)
                  : <span className="neg">{formatMoney(-subtotal)}</span>}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}

function SummaryBlock({ stmt }: { stmt: IncomeStatement }) {
  const showCost = Math.abs(stmt.groupCost) > 0.005
  const showOtherIncome = Math.abs(stmt.groupOtherIncome) > 0.005
  return (
    <section className="border-t-2 border-hairline pt-6">
      <div className="sect-head">
        <h2>Summary</h2>
        <span className="rule" aria-hidden />
        <span className="count">ALL POOLS</span>
      </div>
      <table className="ledger-table">
        <tbody>
          <tr>
            <td className="text-graphite">Group revenue</td>
            <td className="num text-ledger">{formatMoney(stmt.groupRevenue)}</td>
          </tr>
          {showCost ? (
            <tr>
              <td className="text-graphite">− Group cost</td>
              <td className="num"><span className="neg">{formatMoney(-stmt.groupCost)}</span></td>
            </tr>
          ) : null}
          <tr className="border-t border-hairline">
            <td className="font-serif italic text-ink font-medium">Gross profit</td>
            <td className={`num ${stmt.groupGrossProfit >= 0 ? 'text-ledger' : 'text-danger'}`}>
              <span className={`font-serif text-xl font-semibold tabular tracking-[-0.01em] ${stmt.groupGrossProfit >= 0 ? 'text-ledger' : 'text-danger'}`}>
                {formatMoney(stmt.groupGrossProfit)}
              </span>
            </td>
          </tr>
          {showOtherIncome ? (
            <tr>
              <td className="text-graphite">+ Group other income</td>
              <td className="num text-ledger">{formatMoney(stmt.groupOtherIncome)}</td>
            </tr>
          ) : null}
          <tr>
            <td className="text-graphite">− Group expense</td>
            <td className="num"><span className="neg">{formatMoney(-stmt.groupExpense)}</span></td>
          </tr>
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-hairline">
            <td className="font-serif italic text-ink font-medium">Group net profit</td>
            <td className={`num ${stmt.groupNetProfit >= 0 ? 'text-ledger' : 'text-danger'}`}>
              <span className={`font-serif text-2xl font-semibold tabular tracking-[-0.01em] ${stmt.groupNetProfit >= 0 ? 'text-ledger' : 'text-danger'}`}>
                {formatMoney(stmt.groupNetProfit)}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
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
