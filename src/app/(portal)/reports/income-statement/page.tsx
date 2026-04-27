import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import { fetchGlForPeriod, startOfMonth, endOfMonth } from '@/lib/gl-reports'
import dayjs from 'dayjs'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{ from?: string; to?: string; period?: string }>
}

export default async function IncomeStatementPage({ searchParams }: Props) {
  await requireRole(['principal', 'finance'])
  const supabase = await createClient()

  const { from: rawFrom, to: rawTo, period } = await searchParams
  // Period selector: month picker is the default; explicit from/to overrides.
  const from = rawFrom ?? startOfMonth(period)
  const to = rawTo ?? endOfMonth(period ?? from)

  const accounts = await fetchGlForPeriod(supabase, {
    from, to,
    types: ['revenue', 'expense'],
  })

  const revenueAccounts = accounts.filter((a) => a.type === 'revenue')
  const expenseAccounts = accounts.filter((a) => a.type === 'expense')
  const totalRevenue = revenueAccounts.reduce((s, a) => s + a.balance, 0)
  const totalExpenses = expenseAccounts.reduce((s, a) => s + a.balance, 0)
  const netProfit = totalRevenue - totalExpenses

  const periodLabel = formatPeriodLabel(from, to)

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
        <PeriodPicker from={from} to={to} />
      </div>

      <div className="max-w-3xl space-y-10">
        <p className="font-serif italic text-muted text-sm">
          Company-wide P&L sourced directly from the general ledger
          ({dayjs(from).format('D MMM YYYY')} → {dayjs(to).format('D MMM YYYY')}).
        </p>

        {/* ── Revenue ── */}
        <section>
          <h2 className="font-sans text-xs uppercase tracking-wide text-ledger font-semibold mb-3">
            Revenue
          </h2>
          {revenueAccounts.length === 0 ? (
            <p className="font-serif italic text-muted text-sm">No revenue posted in this period.</p>
          ) : (
            <table className="ledger-table">
              <tbody>
                {revenueAccounts.map((a) => (
                  <tr key={a.code}>
                    <td className="font-mono text-xs text-graphite w-20">{a.code}</td>
                    <td>{a.name}</td>
                    <td className="num">{formatMoney(a.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex items-baseline justify-between pt-3 mt-3 border-t border-hairline">
            <span className="font-serif italic text-base text-ink font-medium">Total Revenue</span>
            <span className="num text-num-ink text-lg font-semibold">{formatMoney(totalRevenue)}</span>
          </div>
        </section>

        {/* ── Expenses ── */}
        <section>
          <h2 className="font-sans text-xs uppercase tracking-wide text-danger font-semibold mb-3">
            Operating Expenses
          </h2>
          {expenseAccounts.length === 0 ? (
            <p className="font-serif italic text-muted text-sm">No expenses posted in this period.</p>
          ) : (
            <table className="ledger-table">
              <tbody>
                {expenseAccounts.map((a) => (
                  <tr key={a.code}>
                    <td className="font-mono text-xs text-graphite w-20">{a.code}</td>
                    <td>{a.name}</td>
                    <td className="num">
                      <span className="neg">{formatMoney(-a.balance)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex items-baseline justify-between pt-3 mt-3 border-t border-hairline">
            <span className="font-serif italic text-base text-ink font-medium">Total Expenses</span>
            <span className="num text-num-ink text-lg font-semibold">
              <span className="neg">{formatMoney(-totalExpenses)}</span>
            </span>
          </div>
        </section>

        {/* ── Net Profit ── */}
        <div className="border-t-2 border-hairline pt-6">
          <div className="flex items-baseline justify-between">
            <span className="font-serif text-2xl text-ink">Net Profit</span>
            <span className={`font-serif text-2xl font-semibold tabular tracking-[-0.01em] ${netProfit >= 0 ? 'text-ledger' : 'text-danger'}`}>
              {formatMoney(netProfit)}
            </span>
          </div>
          <p className="font-serif italic text-muted text-xs mt-3">
            Net Profit = Total Revenue − Total Expenses · Sourced from
            <span className="font-mono"> journal_lines</span> WHERE account.type ∈ (&apos;revenue&apos;, &apos;expense&apos;).
          </p>
        </div>
      </div>
    </div>
  )
}

function PeriodPicker({ from, to }: { from: string; to: string }) {
  const monthValue = dayjs(from).format('YYYY-MM')
  const wholeMonth = dayjs(from).startOf('month').isSame(from, 'day')
                     && dayjs(to).endOf('month').isSame(to, 'day')
                     && dayjs(from).isSame(to, 'month')
  return (
    <form className="shrink-0 flex items-center gap-2">
      <input
        type="month"
        name="period"
        defaultValue={wholeMonth ? monthValue : undefined}
        className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
      />
      <noscript>
        <button type="submit" className="text-xs text-accent font-serif italic">Apply</button>
      </noscript>
    </form>
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
