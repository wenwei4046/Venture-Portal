import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { formatMoney } from '@/lib/utils'
import {
  fetchCashflowStatement,
  startOfMonth,
  endOfMonth,
  pivotCashflowByPool,
  type CashflowByPoolBlock,
} from '@/lib/cfo-reports'
import { poolLabel, comparePools } from '@/lib/pools'
import { SegmentedReport, type ReportSegment } from '@/app/(portal)/reports/_components/SegmentedReport'
import { SegmentExportButtons } from '@/app/(portal)/reports/_components/SegmentExportButtons'
import type { CashFlowCategory } from '@/lib/coa'
import dayjs from 'dayjs'
import Link from 'next/link'

// Always show one cash-flow tab per pool, even when the pool had no activity
// in the period. Mirrors the Income Statement's per-pool layout.
const STANDARD_POOLS: readonly string[] = [
  'venture_pool',
  'dept_pool_marketing',
  'dept_pool_hr',
  'dept_pool_finance',
  'dept_pool_director_office',
  'dept_pool_director',
]
const EMPTY_SECTIONS: CashflowByPoolBlock['sections'] = (
  ['operating', 'investing', 'financing'] as const
).map((cat) => ({ category: cat, inflowLines: [], outflowLines: [], net: 0 }))

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
          <SegmentExportButtons basePath="/reports/cash-flow/export" from={from} to={to} />
        </div>
      </div>

      <p className="font-serif italic text-muted text-sm mb-8 max-w-3xl">
        Three sections — Operating, Investing, Financing — driven by each
        account&apos;s <code className="font-mono text-xs">cash_flow_category</code>
        in the chart of accounts. Each section breaks down by pool. Internal
        bank-to-bank transfers are excluded.
      </p>

      <div className="max-w-3xl">
        {(() => {
          const pivot = pivotCashflowByPool(stmt)
          // Inject empty blocks for any standard pool not in the pivot, so every
          // pool gets its own tab even if it had no cash activity this period.
          const present = new Set(pivot.pools.map((p) => p.pool))
          const padded: CashflowByPoolBlock[] = [
            ...pivot.pools,
            ...STANDARD_POOLS.filter((p) => !present.has(p)).map<CashflowByPoolBlock>((p) => ({
              pool: p,
              poolLabel: poolLabel(p),
              sections: EMPTY_SECTIONS,
              net: 0,
            })),
          ].sort((a, b) => comparePools(a.pool, b.pool))
          return (
            <SegmentedReport
              defaultKey="summary"
              segments={[
                { key: 'summary', label: 'Summary', panel: <SummaryPanel stmt={stmt} /> },
                ...padded.map<ReportSegment>((b) => ({
                  key: b.pool,
                  label: b.poolLabel,
                  panel: <PoolCashflowPanel block={b} />,
                })),
              ]}
            />
          )
        })()}
      </div>
    </div>
  )
}

function SummaryPanel({ stmt }: { stmt: import('@/lib/cfo-reports').CashflowStatement }) {
  const reconciled = Math.abs(stmt.openingCash + stmt.netChange - stmt.closingCash) < 0.01
  return (
    <section className="border-t-2 border-hairline pt-6">
      <div className="sect-head">
        <h2>Cash reconciliation</h2>
        <span className="rule" aria-hidden />
        <span className={`count ${reconciled ? 'text-ledger' : 'text-danger'}`}>
          {reconciled ? 'TIES TO BALANCE SHEET' : 'OUT OF BALANCE'}
        </span>
      </div>
      <table className="ledger-table">
        <tbody>
          <tr>
            <td className="font-serif italic text-ink">Opening cash</td>
            <td className="num">
              {stmt.openingCash < 0 ? <span className="neg">{formatMoney(stmt.openingCash)}</span> : formatMoney(stmt.openingCash)}
            </td>
          </tr>
          {stmt.sections.map((s) => (
            <tr key={s.category}>
              <td>{SECTION_INTRO[s.category]}</td>
              <td className="num">
                {s.net < 0 ? <span className="neg">{formatMoney(s.net)}</span> : formatMoney(s.net)}
              </td>
            </tr>
          ))}
          <tr className="border-t border-hairline">
            <td className="font-serif italic text-graphite text-sm">Net change in cash</td>
            <td className={`num font-semibold ${stmt.netChange >= 0 ? 'text-ledger' : 'text-danger'}`}>
              {stmt.netChange < 0 ? <span className="neg">{formatMoney(stmt.netChange)}</span> : formatMoney(stmt.netChange)}
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-hairline">
            <td className="font-serif italic text-ink font-medium">Closing cash</td>
            <td className={`num font-semibold ${stmt.closingCash >= 0 ? 'text-ledger' : 'text-danger'}`}>
              <span className={`font-serif text-2xl font-semibold tabular tracking-[-0.01em] ${stmt.closingCash >= 0 ? 'text-ledger' : 'text-danger'}`}>
                {formatMoney(stmt.closingCash)}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="font-serif italic text-muted text-xs mt-3">
        {reconciled
          ? 'Opening cash + net change = closing cash, which equals the Balance Sheet bank balance as at period end.'
          : `Opening (${formatMoney(stmt.openingCash)}) + net change (${formatMoney(stmt.netChange)}) does not equal closing (${formatMoney(stmt.closingCash)}).`}
      </p>
    </section>
  )
}

function PoolCashflowPanel({ block }: { block: CashflowByPoolBlock }) {
  return (
    <section>
      <div className="sect-head">
        <h2>{block.poolLabel}</h2>
        <span className="rule" aria-hidden />
        <span className={`count ${block.net >= 0 ? 'text-ledger' : 'text-danger'}`}>
          NET {formatMoney(block.net)}
        </span>
      </div>
      <div className="space-y-6">
        {block.sections.map((sec) => (
          <div key={sec.category}>
            <h3 className="font-serif italic text-accent text-sm mb-2">
              {SECTION_INTRO[sec.category]}
            </h3>
            <table className="ledger-table">
              <tbody>
                {sec.inflowLines.map((l) => (
                  <tr key={`in-${l.label}`}>
                    <td className="text-sm">{l.label}</td>
                    <td className="num text-ledger">
                      {l.amount < 0 ? <span className="neg">{formatMoney(l.amount)}</span> : formatMoney(l.amount)}
                    </td>
                  </tr>
                ))}
                {sec.outflowLines.map((l) => (
                  <tr key={`out-${l.label}`}>
                    <td className="text-sm">{l.label}</td>
                    <td className="num"><span className="neg">{formatMoney(-l.amount)}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-hairline">
                  <td className="font-serif italic text-graphite text-sm">{SECTION_INTRO[sec.category]} net</td>
                  <td className={`num font-semibold ${sec.net >= 0 ? 'text-ledger' : 'text-danger'}`}>
                    {sec.net < 0 ? <span className="neg">{formatMoney(sec.net)}</span> : formatMoney(sec.net)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ))}
      </div>
      <table className="ledger-table mt-6">
        <tbody>
          <tr className="border-t-2 border-hairline">
            <td className="font-serif italic text-ink font-medium">
              Net cash surplus / (deficiency)
            </td>
            <td className={`num font-semibold ${block.net >= 0 ? 'text-ledger' : 'text-danger'}`}>
              <span className={`font-serif text-2xl font-semibold tabular tracking-[-0.01em] ${block.net >= 0 ? 'text-ledger' : 'text-danger'}`}>
                {formatMoney(block.net)}
              </span>
            </td>
          </tr>
        </tbody>
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
