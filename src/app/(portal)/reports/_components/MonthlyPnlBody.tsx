import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'
import { r2, sliceMatrixMonths } from '@/lib/monthly-matrix'
import type { loadMonthlyPnl } from '@/lib/monthly-statements'
import { fromChoices, rangeLabel, toChoices, type ReportRange } from '@/lib/report-range'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import { sheetColumns, sheetFromMatrix } from '@/lib/report-sheet'
import SheetReport, { type MonthlyDrill } from './SheetReport'
import { ReportSearchProvider } from './ReportSearchProvider'
import ReportToolbar from './ReportToolbar'
import type { ReportSegmentOption } from './report-segments'

/**
 * The month-by-month P&L under its head (2026-10-09, the user's Claude Design
 * handoff): four cards, then the period From – To, Find account, Segment and
 * Detail level on one row over the matrix, cut to From with its months
 * separated. Reports' P&L draws it, and so does a department's page under Dept
 * Pool (2026-10-09) — there with no Segment, the page being the segment.
 * The table is the handoff's own since 2026-10-10 (SheetReport); its accounts
 * open onto their months and lines (2026-10-24) through the page's own action.
 */
export default function MonthlyPnlBody({
  pnl: { data, rows },
  range,
  nowYM,
  segmentLabel,
  segment = '',
  segments = [],
  drill,
}: {
  pnl: Awaited<ReturnType<typeof loadMonthlyPnl>>
  range: ReportRange
  nowYM: string
  /** What the section counts: "All segments (consolidated)", "Marketing" … */
  segmentLabel: string
  segment?: string
  /** Empty = no segment choice. */
  segments?: ReportSegmentOption[]
  /** The page's action that reads an opened account's lines, and the segment it reads them for. */
  drill?: Omit<MonthlyDrill, 'report'>
}) {
  const cost = data.accounts.filter((a) => a.defaultCategory === 'cost' || a.defaultCategory === 'expense')
  const expenses = data.columns.map((_, i) => r2(-cost.reduce((s, a) => s + (a.values[i] ?? 0), 0)))
  const net = rows.find((r) => r.key === 'NET_INCOME')?.values ?? data.columns.map(() => 0)
  const cut = sliceMatrixMonths(data.columns, rows, range.from, { base: data.salesByColumn })
  const sums = sliceMatrixMonths(data.columns, [
    { key: 'rev', values: data.salesByColumn },
    { key: 'exp', values: expenses },
    { key: 'net', values: net },
  ], range.from).rows
  const [rev, exp, netCut] = sums.map((s) => s.values)
  const toName = dayjs(`${range.to}-01`).format('MMM') + (range.to === nowYM ? ' (to date)' : '')
  const margin = Math.abs(rev[0]) < 0.005 ? '—' : `${((netCut[0] / rev[0]) * 100).toFixed(1)}%`

  return (
    <>
      <StatCards label="P&L">
        <StatCard label={`Revenue · ${toName}`} value={formatMoney(rev[1] ?? 0)} icon="receipt" tone="ledger" note={`Accumulated ${formatMoney(rev[0])}`} />
        <StatCard label={`Expenses · ${toName}`} value={formatMoney(exp[1] ?? 0)} icon="wallet" tone="danger" note={`Accumulated ${formatMoney(exp[0])}`} />
        <StatCard label="Net profit · accumulated" value={formatMoney(netCut[0])} icon="chart" tone={netCut[0] < 0 ? 'danger' : 'primary'} note="Selected period" />
        <StatCard label="Net margin · accumulated" value={margin} icon="percent" note="Against accumulated sales" />
      </StatCards>

      {/* L4 where the accounts open onto their lines (2026-10-26). */}
      <ReportSearchProvider level={3} levels={drill ? 4 : 3}>
        <section className="mb-6">
          <div className="sect-head">
            <h2>Monthly P&amp;L</h2>
            <span className="rule" aria-hidden />
            <span className="count">
              {segmentLabel.toUpperCase()} · {rangeLabel(range.from, range.to).toUpperCase()}
            </span>
          </div>
          <ReportToolbar
            from={range.from}
            to={range.to}
            fromOptions={fromChoices(range.to)}
            toOptions={toChoices(nowYM)}
            segment={segment}
            segments={segments}
          />
          <SheetReport
            columns={sheetColumns(cut.columns, nowYM)}
            rows={sheetFromMatrix(cut.rows)}
            pctBase={cut.base}
            monthly={drill ? { ...drill, report: 'pnl' } : undefined}
          />
        </section>
      </ReportSearchProvider>
    </>
  )
}
