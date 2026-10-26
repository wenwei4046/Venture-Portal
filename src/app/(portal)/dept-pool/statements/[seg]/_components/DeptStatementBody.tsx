import dayjs from 'dayjs'
import { formatMoney } from '@/lib/utils'
import { r2, sliceMatrixMonths } from '@/lib/monthly-matrix'
import type { loadMonthlyCashFlow, loadMonthlyPnl } from '@/lib/monthly-statements'
import { rangeLabel, type ReportRange } from '@/lib/report-range'
import { cashFlowCharts, pieceColors, pnlCharts, type DeptChartData } from '@/lib/dept-charts'
import { deptCashFlowSheet, deptPnlSheet, deptSheetColumns } from '@/lib/dept-statement'
import type { SheetColumn, SheetRow } from '@/lib/report-sheet'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import SheetReport, { type MonthlyDrill } from '../../../../reports/_components/SheetReport'
import { ReportSearchProvider } from '../../../../reports/_components/ReportSearchProvider'
import ReportToolbar from '../../../../reports/_components/ReportToolbar'
import DeptCharts from './DeptCharts'

/**
 * A department's Cash Flow and P&L under its period row (2026-10-25, the mockup's twelfth round): the cards (money
 * in green, money out orange — as the charts draw them — and out as a positive figure), the charts, then the one
 * statement in the charts' dress. Every figure is the loader's, cut to From as Reports cuts it; the charts read the
 * same matrix (lib/dept-charts), the statement its rows (lib/dept-statement).
 */

interface Common {
  range: ReportRange
  nowYM: string
  /** The department ("Marketing"). */
  label: string
  /** The page's action that reads an opened account's lines, and the segment it reads them for. */
  drill: Omit<MonthlyDrill, 'report'>
}

// The charts are keyed by the period: a new From or To starts them on the Total again, not on whichever month
// stood at the same place before.

/** The month still running, when the period shows it. */
const runningOf = (charts: DeptChartData, nowYM: string) => (charts.months.includes(nowYM) ? nowYM : null)

function Statement({ title, label, range, note, columns, rows, monthly }: {
  title: string
  label: string
  range: ReportRange
  note: string
  columns: SheetColumn[]
  rows: SheetRow[]
  monthly: MonthlyDrill
}) {
  return (
    // L2 to begin with: the blocks and their categories, each opened by its ▶ (round 11).
    <ReportSearchProvider level={2}>
      <section className="mb-6">
        <div className="sect-head">
          <h2>{title}</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {label.toUpperCase()} · {rangeLabel(range.from, range.to).toUpperCase()}
          </span>
        </div>
        <ReportToolbar mode="none" segment="" segments={[]} />
        <p className="dept-st-note">{note}</p>
        <SheetReport columns={columns} rows={rows} monthly={monthly} variant="dept" />
      </section>
    </ReportSearchProvider>
  )
}

export function DeptCashFlowBody({ cashFlow: { data, rows }, range, nowYM, label, drill }: Common & { cashFlow: Awaited<ReturnType<typeof loadMonthlyCashFlow>> }) {
  const cut = sliceMatrixMonths(data.columns, rows, range.from)
  // A card reads the Total of its line as cut to From: a flow adds up, an opening reads its first month, a closing its last.
  const pick = (values: number[], key = 'flow') => sliceMatrixMonths(data.columns, [{ key, values }], range.from).rows[0].values[0]
  const charts = cashFlowCharts(data, range.from)
  const net = pick(data.netChangeByCol)

  return (
    <>
      <StatCards label="Cash flow">
        <StatCard label="Opening cash" value={formatMoney(pick(data.openingByCol, 'OPENING_CASH'))} icon="wallet" note="Start of period" />
        <StatCard label="Money in" value={formatMoney(charts.in.total)} icon="inbox" tone="in" note="Selected period" />
        <StatCard label="Money out" value={formatMoney(charts.out.total)} icon="send" tone="out" note="Selected period" />
        <StatCard label="Net change" value={formatMoney(net)} icon="swap" tone={net < 0 ? 'danger' : 'ledger'} note="All movements" />
        <StatCard label="Closing cash" value={formatMoney(pick(data.closingByCol, 'CLOSING_CASH'))} icon="bank" tone="primary" note="End of period" />
      </StatCards>

      <DeptCharts key={`${range.from}:${range.to}`} view="cash-flow" data={charts} running={runningOf(charts, nowYM)} />

      <Statement
        title="Monthly cash flow"
        label={label}
        range={range}
        note="RM · % = of that month’s money in or money out · Net change: of money in · latest month first"
        columns={deptSheetColumns(cut.columns, nowYM)}
        rows={deptCashFlowSheet(cut.rows, { in: pieceColors(charts.in), out: pieceColors(charts.out) })}
        monthly={{ ...drill, report: 'cash-flow' }}
      />
    </>
  )
}

export function DeptPnlBody({ pnl: { data, rows }, range, nowYM, label, drill }: Common & { pnl: Awaited<ReturnType<typeof loadMonthlyPnl>> }) {
  const cost = data.accounts.filter((a) => a.defaultCategory === 'cost' || a.defaultCategory === 'expense')
  const expenses = data.columns.map((_, i) => r2(-cost.reduce((s, a) => s + (a.values[i] ?? 0), 0)))
  const net = rows.find((r) => r.key === 'NET_INCOME')?.values ?? data.columns.map(() => 0)
  const cut = sliceMatrixMonths(data.columns, rows, range.from, { base: data.salesByColumn })
  const [rev, exp, netCut] = sliceMatrixMonths(data.columns, [
    { key: 'rev', values: data.salesByColumn },
    { key: 'exp', values: expenses },
    { key: 'net', values: net },
  ], range.from).rows.map((s) => s.values)
  const toName = dayjs(`${range.to}-01`).format('MMM') + (range.to === nowYM ? ' (to date)' : '')
  const margin = Math.abs(rev[0]) < 0.005 ? '—' : `${((netCut[0] / rev[0]) * 100).toFixed(1)}%`
  const charts = pnlCharts(data, net, range.from)

  return (
    <>
      <StatCards label="P&L">
        <StatCard label={`Revenue · ${toName}`} value={formatMoney(rev[1] ?? 0)} icon="receipt" tone="in" note={`Accumulated ${formatMoney(rev[0])}`} />
        <StatCard label={`Expenses · ${toName}`} value={formatMoney(exp[1] ?? 0)} icon="wallet" tone="out" note={`Accumulated ${formatMoney(exp[0])}`} />
        <StatCard label="Net profit · accumulated" value={formatMoney(netCut[0])} icon="chart" tone={netCut[0] < 0 ? 'danger' : 'primary'} note="Selected period" />
        <StatCard label="Net margin · accumulated" value={margin} icon="percent" note="Against accumulated sales" />
      </StatCards>

      <DeptCharts key={`${range.from}:${range.to}`} view="pnl" data={charts} running={runningOf(charts, nowYM)} />

      <Statement
        title="Monthly P&L"
        label={label}
        range={range}
        note="RM · % = of that month’s revenue · Net profit: the margin · latest month first"
        columns={deptSheetColumns(cut.columns, nowYM)}
        rows={deptPnlSheet(cut.rows, data.accounts, { in: pieceColors(charts.in), out: pieceColors(charts.out) }, cut.base ?? data.salesByColumn)}
        monthly={{ ...drill, report: 'pnl' }}
      />
    </>
  )
}
