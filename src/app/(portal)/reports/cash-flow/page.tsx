import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import {
  fetchCashflowStatement,
  startOfMonth,
  endOfMonth,
  type PoolCashflow,
  type Line,
} from '@/lib/cfo-reports'
import dayjs from 'dayjs'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{ from?: string; to?: string; period?: string }>
}

export default async function CashFlowPage({ searchParams }: Props) {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { from: rawFrom, to: rawTo, period } = await searchParams
  const from = rawFrom ?? startOfMonth(period)
  const to = rawTo ?? endOfMonth(period ?? from)

  const stmt = await fetchCashflowStatement(supabase, { from, to })
  const periodLabel = formatPeriodLabel(from, to)

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · CASH FLOW · {periodLabel.toUpperCase()}
          </div>
          <h1 className="page-title">Cash Flow Statement</h1>
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
        One section per pool. <strong>Inflow</strong> splits fund-in (borrowed
        principal / capital) from revenue; <strong>Outflow</strong> splits capital
        (loans disbursed / principal repaid) from expenses. Internal bank-to-bank
        transfers are excluded.
      </p>

      <div className="max-w-3xl space-y-12">
        {stmt.pools.length === 0 ? (
          <div className="border border-hairline rounded-md bg-surface p-6 text-center">
            <p className="font-serif italic text-muted text-sm">
              No paid vouchers in this period. Approve and pay vouchers to populate the cashflow.
            </p>
          </div>
        ) : (
          stmt.pools.map((p) => <PoolBlock key={p.pool} pool={p} />)
        )}

        {/* Net cash change */}
        <section className="border-t-2 border-hairline pt-6">
          <div className="sect-head">
            <h2>Net cash change</h2>
            <span className="rule" aria-hidden />
            <span className="count">ALL POOLS</span>
          </div>
          <div className="flex items-baseline justify-between mb-4">
            <span className="font-serif text-lg text-ink">Net change this period</span>
            <span className={`font-serif text-2xl font-semibold tabular ${stmt.netChange >= 0 ? 'text-ledger' : 'text-danger'}`}>
              {formatMoney(stmt.netChange)}
            </span>
          </div>
          {stmt.pools.length > 0 ? (
            <table className="ledger-table">
              <tbody>
                {stmt.pools.map((p) => (
                  <tr key={p.pool}>
                    <td>{p.poolLabel}</td>
                    <td className="num">
                      {p.net < 0 ? <span className="neg">{formatMoney(p.net)}</span> : formatMoney(p.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>
      </div>
    </div>
  )
}

function LineGroup({ title, lines, subtotal, positive }: { title: string; lines: Line[]; subtotal: number; positive: boolean }) {
  if (lines.length === 0) return null
  return (
    <>
      <tr>
        <td colSpan={2} className="font-mono text-[11px] uppercase tracking-wide text-muted pt-3">{title}</td>
      </tr>
      {lines.map((l) => (
        <tr key={`${title}-${l.label}`}>
          <td className="text-sm pl-4">{l.label}</td>
          <td className={`num ${positive ? 'text-ledger' : ''}`}>
            {positive
              ? (l.amount < 0 ? <span className="neg">{formatMoney(l.amount)}</span> : formatMoney(l.amount))
              : <span className="neg">{formatMoney(-l.amount)}</span>}
          </td>
        </tr>
      ))}
      <tr>
        <td className="font-serif italic text-graphite text-sm pl-4">{title} subtotal</td>
        <td className={`num font-semibold ${positive ? 'text-ledger' : ''}`}>
          {positive ? formatMoney(subtotal) : <span className="neg">{formatMoney(-subtotal)}</span>}
        </td>
      </tr>
    </>
  )
}

function PoolBlock({ pool }: { pool: PoolCashflow }) {
  const fundInTotal = pool.inflow.fundIn.reduce((s, l) => s + l.amount, 0)
  const revenueTotal = pool.inflow.revenue.reduce((s, l) => s + l.amount, 0)
  const capitalTotal = pool.outflow.capital.reduce((s, l) => s + l.amount, 0)
  const expenseTotal = pool.outflow.expense.reduce((s, l) => s + l.amount, 0)
  return (
    <section>
      <div className="sect-head">
        <h2>{pool.poolLabel}</h2>
        <span className="rule" aria-hidden />
        <span className={`count ${pool.net >= 0 ? 'text-ledger' : 'text-danger'}`}>
          NET {formatMoney(pool.net)}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
        {/* Inflow */}
        <div>
          <h3 className="font-serif italic text-accent text-sm mb-2">Inflow</h3>
          {pool.inflow.fundIn.length === 0 && pool.inflow.revenue.length === 0 ? (
            <p className="font-serif italic text-muted text-xs">No inflows.</p>
          ) : (
            <table className="ledger-table">
              <tbody>
                <LineGroup title="Fund-in / capital" lines={pool.inflow.fundIn} subtotal={fundInTotal} positive />
                <LineGroup title="Revenue" lines={pool.inflow.revenue} subtotal={revenueTotal} positive />
              </tbody>
              <tfoot>
                <tr className="border-t border-hairline">
                  <td className="font-serif italic text-graphite text-sm">Total inflow</td>
                  <td className="num text-ledger font-semibold">{formatMoney(pool.inflow.total)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Outflow */}
        <div>
          <h3 className="font-serif italic text-accent text-sm mb-2">Outflow</h3>
          {pool.outflow.capital.length === 0 && pool.outflow.expense.length === 0 ? (
            <p className="font-serif italic text-muted text-xs">No outflows.</p>
          ) : (
            <table className="ledger-table">
              <tbody>
                <LineGroup title="Capital" lines={pool.outflow.capital} subtotal={capitalTotal} positive={false} />
                <LineGroup title="Expense" lines={pool.outflow.expense} subtotal={expenseTotal} positive={false} />
              </tbody>
              <tfoot>
                <tr className="border-t border-hairline">
                  <td className="font-serif italic text-graphite text-sm">Total outflow</td>
                  <td className="num font-semibold"><span className="neg">{formatMoney(-pool.outflow.total)}</span></td>
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
