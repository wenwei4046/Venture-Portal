import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import {
  fetchCashflowStatement,
  startOfMonth,
  endOfMonth,
  type CashflowSection,
  type CashflowPoolBlock,
} from '@/lib/cfo-reports'
import type { CashFlowCategory } from '@/lib/coa'
import dayjs from 'dayjs'
import Link from 'next/link'

interface Props {
  searchParams: Promise<{ from?: string; to?: string; period?: string }>
}

const SECTION_INTRO: Record<CashFlowCategory, string> = {
  operating: 'A. Operating activities',
  investing: 'B. Investing activities',
  financing: 'C. Financing activities',
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
        <div className="flex items-center gap-3 shrink-0">
          <form>
            <input
              type="month"
              name="period"
              defaultValue={dayjs(from).format('YYYY-MM')}
              className="px-3 py-2 bg-paper border border-hairline rounded-md text-sm font-mono text-ink focus:outline-none focus:border-accent-border"
            />
          </form>
          <Link
            href={`/reports/cash-flow/export?format=xlsx&from=${from}&to=${to}`}
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            Export Excel
          </Link>
          <Link
            href={`/reports/cash-flow/export?format=pdf&from=${from}&to=${to}`}
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            Export PDF
          </Link>
        </div>
      </div>

      <p className="font-serif italic text-muted text-sm mb-8 max-w-3xl">
        Three sections — Operating, Investing, Financing — driven by each
        account&apos;s <code className="font-mono text-xs">cash_flow_category</code>
        in the chart of accounts. Each section breaks down by pool. Internal
        bank-to-bank transfers are excluded.
      </p>

      <div className="max-w-3xl space-y-12">
        {stmt.sections.map((section) => (
          <CashflowSectionBlock key={section.category} section={section} />
        ))}

        {/* Net cash change */}
        <section className="border-t-2 border-hairline pt-6">
          <div className="sect-head">
            <h2>Net cash change</h2>
            <span className="rule" aria-hidden />
            <span className="count">ALL SECTIONS</span>
          </div>
          <table className="ledger-table">
            <tbody>
              {stmt.sections.map((s) => (
                <tr key={s.category}>
                  <td>{SECTION_INTRO[s.category]}</td>
                  <td className="num">
                    {s.net < 0
                      ? <span className="neg">{formatMoney(s.net)}</span>
                      : formatMoney(s.net)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-hairline">
                <td className="font-serif italic text-ink font-medium">Net change this period</td>
                <td className={`num font-semibold ${stmt.netChange >= 0 ? 'text-ledger' : 'text-danger'}`}>
                  <span className={`font-serif text-2xl font-semibold tabular tracking-[-0.01em] ${stmt.netChange >= 0 ? 'text-ledger' : 'text-danger'}`}>
                    {formatMoney(stmt.netChange)}
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

function CashflowSectionBlock({ section }: { section: CashflowSection }) {
  const heading = SECTION_INTRO[section.category]
  const empty = section.pools.length === 0
  return (
    <section>
      <div className="sect-head">
        <h2>{heading}</h2>
        <span className="rule" aria-hidden />
        <span className={`count ${section.net >= 0 ? 'text-ledger' : 'text-danger'}`}>
          NET {formatMoney(section.net)}
        </span>
      </div>

      {empty ? (
        <p className="font-serif italic text-muted text-sm">No activity in this period.</p>
      ) : (
        <div className="space-y-6">
          {section.pools.map((pool) => (
            <PoolCashBlock key={pool.pool} pool={pool} />
          ))}
          <table className="ledger-table">
            <tfoot>
              <tr className="border-t-2 border-hairline">
                <td className="font-serif italic text-ink font-medium">{heading} subtotal</td>
                <td className={`num font-semibold ${section.net >= 0 ? 'text-ledger' : 'text-danger'}`}>
                  <span className={`font-serif text-lg font-semibold tabular tracking-[-0.01em] ${section.net >= 0 ? 'text-ledger' : 'text-danger'}`}>
                    {formatMoney(section.net)}
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

function PoolCashBlock({ pool }: { pool: CashflowPoolBlock }) {
  const noFlow = pool.inflowLines.length === 0 && pool.outflowLines.length === 0
  if (noFlow) return null
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-serif italic text-accent text-sm">{pool.poolLabel}</h3>
        <span className={`font-mono text-xs ${pool.net >= 0 ? 'text-ledger' : 'text-danger'}`}>
          NET {formatMoney(pool.net)}
        </span>
      </div>
      <table className="ledger-table">
        <tbody>
          {pool.inflowLines.map((l) => (
            <tr key={`in-${l.label}`}>
              <td className="text-sm">{l.label}</td>
              <td className="num text-ledger">
                {l.amount < 0
                  ? <span className="neg">{formatMoney(l.amount)}</span>
                  : formatMoney(l.amount)}
              </td>
            </tr>
          ))}
          {pool.outflowLines.map((l) => (
            <tr key={`out-${l.label}`}>
              <td className="text-sm">{l.label}</td>
              <td className="num"><span className="neg">{formatMoney(-l.amount)}</span></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-hairline">
            <td className="font-serif italic text-graphite text-sm">{pool.poolLabel} net</td>
            <td className={`num font-semibold ${pool.net >= 0 ? 'text-ledger' : 'text-danger'}`}>
              {pool.net < 0
                ? <span className="neg">{formatMoney(pool.net)}</span>
                : formatMoney(pool.net)}
            </td>
          </tr>
        </tfoot>
      </table>
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
