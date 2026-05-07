import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import {
  fetchIncomeStatement,
  startOfMonth,
  endOfMonth,
  SEGMENT_LABEL,
  type DeptPnl,
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
  const treasury = stmt.treasury
  const deptMargin = stmt.groupRevenue - stmt.groupDeptCost

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
        Per-department P&amp;L with line items: revenue per invoice, cost per
        category. Treasury (loan interest) sits at group level alongside general
        corporate expenses.
      </p>

      <div className="max-w-3xl space-y-12">
        {/* ─── Per-dept P&L (one block per dept with line items) ─── */}
        {stmt.perDept.map((d) => (
          <DeptBlock key={d.segment} dept={d} />
        ))}

        {/* ─── Dept margin subtotal ─── */}
        <div className="border-t border-hairline pt-4">
          <div className="flex items-baseline justify-between">
            <span className="font-serif italic text-graphite">Dept margin (sum)</span>
            <span className={`font-mono tabular text-lg ${deptMargin >= 0 ? 'text-ledger' : 'text-danger'}`}>
              {formatMoney(deptMargin)}
            </span>
          </div>
          <div className="font-mono text-[11.5px] text-muted mt-1">
            Σ revenue {formatMoney(stmt.groupRevenue)} − Σ cost {formatMoney(stmt.groupDeptCost)}
          </div>
        </div>

        {/* ─── Treasury section ─── */}
        <section>
          <div className="sect-head">
            <h2>Treasury</h2>
            <span className="rule" aria-hidden />
            <span className="count">LOAN INTEREST · PENALTY · FUND SOURCE INTEREST</span>
          </div>
          <table className="ledger-table">
            <tbody>
              <tr>
                <td>Interest income — Loans <span className="font-mono text-muted text-xs ml-1">(4010)</span></td>
                <td className="num text-ledger">{formatMoney(treasury.interestIncome)}</td>
              </tr>
              {treasury.penaltyIncome !== 0 ? (
                <tr>
                  <td>Penalty income <span className="font-mono text-muted text-xs ml-1">(4020)</span></td>
                  <td className="num text-ledger">{formatMoney(treasury.penaltyIncome)}</td>
                </tr>
              ) : null}
              <tr>
                <td>Interest expense — Fund sources <span className="font-mono text-muted text-xs ml-1">(5010)</span></td>
                <td className="num"><span className="neg">{formatMoney(-treasury.interestExpense)}</span></td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-hairline">
                <td className="font-serif italic text-ink font-medium">Treasury net</td>
                <td className={`num font-semibold ${treasury.net >= 0 ? 'text-ledger' : 'text-danger'}`}>
                  {formatMoney(treasury.net)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* ─── Group general expenses ─── */}
        <section>
          <div className="sect-head">
            <h2>General expenses</h2>
            <span className="rule" aria-hidden />
            <span className="count">GROUP-LEVEL · CORPORATE · UNALLOCATED</span>
          </div>
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

        {/* ─── Group net profit ─── */}
        <div className="border-t-2 border-hairline pt-6">
          <div className="flex items-baseline justify-between">
            <span className="font-serif text-lg text-ink">Group net profit</span>
            <span className={`font-serif text-2xl font-semibold tabular ${stmt.groupNetProfit >= 0 ? 'text-ledger' : 'text-danger'}`}>
              {formatMoney(stmt.groupNetProfit)}
            </span>
          </div>
          <p className="font-serif italic text-muted text-xs mt-2">
            Dept margin {formatMoney(deptMargin)} + Treasury net {formatMoney(treasury.net)} − General {formatMoney(stmt.groupGeneralTotal)}
          </p>
        </div>
      </div>
    </div>
  )
}

function DeptBlock({ dept }: { dept: DeptPnl }) {
  const hasAny = dept.revenueLines.length > 0 || dept.costLines.length > 0
  return (
    <section>
      <div className="sect-head">
        <h2>{SEGMENT_LABEL[dept.segment]}</h2>
        <span className="rule" aria-hidden />
        <span className={`count ${dept.margin >= 0 ? 'text-ledger' : 'text-danger'}`}>
          MARGIN {formatMoney(dept.margin)}
        </span>
      </div>

      {!hasAny ? (
        <p className="font-serif italic text-muted text-sm">No activity this period.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
          {/* Revenue */}
          <div>
            <h3 className="font-serif italic text-accent text-sm mb-2">Revenue</h3>
            {dept.revenueLines.length === 0 ? (
              <p className="font-serif italic text-muted text-xs">No invoices.</p>
            ) : (
              <table className="ledger-table">
                <tbody>
                  {dept.revenueLines.map((l) => (
                    <tr key={l.label}>
                      <td className="text-sm">{l.label}</td>
                      <td className="num text-ledger">{formatMoney(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-hairline">
                    <td className="font-serif italic text-graphite text-sm">Subtotal</td>
                    <td className="num text-ledger font-semibold">{formatMoney(dept.revenue)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* Cost */}
          <div>
            <h3 className="font-serif italic text-accent text-sm mb-2">Cost</h3>
            {dept.costLines.length === 0 ? (
              <p className="font-serif italic text-muted text-xs">No expenses.</p>
            ) : (
              <table className="ledger-table">
                <tbody>
                  {dept.costLines.map((l) => (
                    <tr key={l.label}>
                      <td className="text-sm">{l.label}</td>
                      <td className="num"><span className="neg">{formatMoney(-l.amount)}</span></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-hairline">
                    <td className="font-serif italic text-graphite text-sm">Subtotal</td>
                    <td className="num font-semibold"><span className="neg">{formatMoney(-dept.cost)}</span></td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}
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
