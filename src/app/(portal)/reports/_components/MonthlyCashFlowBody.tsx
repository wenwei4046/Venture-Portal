import { formatMoney } from '@/lib/utils'
import { sliceMatrixMonths } from '@/lib/monthly-matrix'
import type { loadMonthlyCashFlow } from '@/lib/monthly-statements'
import { fromChoices, rangeLabel, toChoices, type ReportRange } from '@/lib/report-range'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import { sheetColumns, sheetFromMatrix } from '@/lib/report-sheet'
import SheetReport from './SheetReport'
import { ReportSearchProvider } from './ReportSearchProvider'
import ReportToolbar from './ReportToolbar'
import type { ReportSegmentOption } from './report-segments'

/**
 * The month-by-month Cash Flow under its head (2026-10-09, the user's Claude
 * Design handoff): five cards, then one control row over the matrix, cut to
 * From. Reports' Cash Flow draws it, and so does a department's page under
 * Dept Pool (2026-10-09) — there with no Segment, the page being the segment.
 * The table is the handoff's own since 2026-10-10 (SheetReport), opened at L3.
 */
export default function MonthlyCashFlowBody({
  cashFlow: { data, rows },
  range,
  nowYM,
  segmentLabel,
  segment = '',
  segments = [],
}: {
  cashFlow: Awaited<ReturnType<typeof loadMonthlyCashFlow>>
  range: ReportRange
  nowYM: string
  /** What the section counts: "All segments (consolidated)", "Marketing" … */
  segmentLabel: string
  segment?: string
  /** Empty = no segment choice. */
  segments?: ReportSegmentOption[]
}) {
  const cut = sliceMatrixMonths(data.columns, rows, range.from)
  // A card reads the Accumulated of its line as cut to From: a flow adds up, an
  // opening reads its first month, a closing or a balance its last.
  const pick = (values: number[], key = 'flow') => sliceMatrixMonths(data.columns, [{ key, values }], range.from).rows[0].values[0]

  return (
    <>
      <StatCards label="Cash flow">
        <StatCard label="Opening cash" value={formatMoney(pick(data.openingByCol, 'OPENING_CASH'))} icon="wallet" note="Start of period" />
        <StatCard label="Money in" value={formatMoney(pick(data.inflowTotalByCol))} icon="inbox" tone="ledger" note="Selected period" />
        <StatCard label="Money out" value={formatMoney(pick(data.outflowTotalByCol))} icon="send" tone="danger" note="Selected period" />
        <StatCard label="Net change" value={formatMoney(pick(data.netChangeByCol))} icon="swap" tone={pick(data.netChangeByCol) < 0 ? 'danger' : 'ledger'} note="All movements" />
        <StatCard label="Closing cash" value={formatMoney(pick(data.closingByCol, 'CLOSING_CASH'))} icon="bank" tone="primary" note="End of period" />
      </StatCards>

      <ReportSearchProvider level={3}>
        <section className="mb-6">
          <div className="sect-head">
            <h2>Monthly cash flow</h2>
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
          <SheetReport columns={sheetColumns(cut.columns, nowYM)} rows={sheetFromMatrix(cut.rows)} />
        </section>
      </ReportSearchProvider>
    </>
  )
}
