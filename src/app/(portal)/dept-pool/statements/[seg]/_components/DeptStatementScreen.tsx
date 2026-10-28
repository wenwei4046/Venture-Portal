import type { SupabaseClient } from '@supabase/supabase-js'
import type { StatementView } from '@/lib/dept-statements'
import { loadMonthlyCashFlow, loadMonthlyPnl } from '@/lib/monthly-statements'
import { rangeLabel, toChoices, type ReportRange } from '@/lib/report-range'
import { segmentFilterFor } from '../../../../reports/_components/report-segments'
import type { MonthlyDrill } from '../../../../reports/_components/SheetReport'
import DeptPeriodBar from './DeptPeriodBar'
import { DeptCashFlowBody, DeptPnlBody } from './DeptStatementBody'

/**
 * A department's P&L or Cash Flow as Dept Pool draws it (2026-10-25, the mockup's twelfth round): the head naming the
 * statement, the period row, then the cards, the charts and the statement. Lifted out of its page on 2026-10-28 so
 * Marketing's own pool draws the very same page for Marketing (the user: "我要exactly 给他们看这个part").
 *
 * `reader` reads the ledger: the session's own client under Dept Pool; the service role's for Marketing's pool, whose
 * page asked for its View first and names the segment in code. An awaited call, not a component: the page hands back
 * what it draws.
 */
export async function renderDeptStatement({
  reader,
  label,
  segment,
  view,
  range,
  nowYM,
  links,
  exportHref,
  drill,
}: {
  reader: SupabaseClient
  /** The department ("Marketing"). */
  label: string
  /** Its report segment. */
  segment: string
  view: StatementView
  range: ReportRange
  nowYM: string
  /** Each statement's address, the period kept. */
  links: Record<StatementView, string>
  /** The Excel and PDF for whoever may take them out; null draws no buttons. */
  exportHref: ((format: 'xlsx' | 'pdf') => string) | null
  /** The page's action that reads an opened account's lines, and the segment it reads them for. */
  drill: Omit<MonthlyDrill, 'report'>
}) {
  const args = {
    year: range.year,
    throughMonth: range.throughMonth,
    segment: segmentFilterFor(segment),
    consolidated: false,
    ...(range.buildFrom ? { from: range.buildFrom } : {}),
  }

  const head = (
    <>
      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> DEPARTMENTS · {label.toUpperCase()} · {rangeLabel(range.from, range.to).toUpperCase()}
          </div>
          <h1 className="page-title">
            {label} - {view === 'pnl' ? 'Profit & Loss' : 'Cash Flow'}
          </h1>
        </div>
        {exportHref ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <a href={exportHref('xlsx')} className="btn-quiet-sheet">
              Excel
            </a>
            <a href={exportHref('pdf')} className="btn-quiet-sheet">
              PDF
            </a>
          </div>
        ) : null}
      </div>
      <DeptPeriodBar view={view} links={links} from={range.from} to={range.to} toOptions={toChoices(nowYM)} />
    </>
  )

  if (view === 'cash-flow') {
    const cashFlow = await loadMonthlyCashFlow(reader, args)
    return (
      <div className="dept-page">
        {head}
        <DeptCashFlowBody cashFlow={cashFlow} range={range} nowYM={nowYM} label={label} drill={drill} />
      </div>
    )
  }

  const pnl = await loadMonthlyPnl(reader, args)
  return (
    <div className="dept-page">
      {head}
      <DeptPnlBody pnl={pnl} range={range} nowYM={nowYM} label={label} drill={drill} />
    </div>
  )
}
