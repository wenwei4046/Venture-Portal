import { officeMonth } from '@/lib/office-time'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
import { loadMonthlyPnl } from '@/lib/monthly-statements'
import { segmentFilterFor } from '../_components/report-segments'
import { extraReportSegments, primedRegistryRows } from '@/lib/dept-registry'
import MonthlyMatrix from '../_components/MonthlyMatrix'
import MonthlyReportControls from '../_components/MonthlyReportControls'
import { ReportSearchProvider } from '../_components/ReportSearchProvider'
import ReportViewToggle from '../_components/ReportViewToggle'
import { reportsCompanyWide } from '@/lib/surfaces'
import { rangeLabel, reportRange } from '@/lib/report-range'
import { REPORT_SEGMENTS } from '../_components/report-segments'
import ReportModeSwitch from '../_components/ReportModeSwitch'
import MonthlyPnlBody from '../_components/MonthlyPnlBody'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ period?: string; segment?: string; from?: string }>
}

export default async function MonthlyPnlPage({ searchParams }: Props) {
  await requirePage('/reports/monthly-pnl')
  const user = await requirePermission('dept_reports')
  const supabase = await createClient()

  const params = await searchParams
  const period = /^\d{4}-\d{2}$/.test(params.period ?? '') ? params.period! : officeMonth()
  // Dept managers see ONLY their own segment (RLS) — force empty + hide picker.
  const isDeptMgr = !reportsCompanyWide(user) // own segment only (Q7: by cell, not kind)
  const segment = isDeptMgr ? '' : (params.segment ?? '')
  const year = Number(period.slice(0, 4))
  const throughMonth = Number(period.slice(5, 7))

  // Consolidated = all-segments view for finance/principal; dept managers'
  // empty segment is their OWN view via RLS — never eliminate for them.
  const consolidated = !isDeptMgr && !segment
  // The read a department's own page under Dept Pool makes for its segment
  // too (2026-10-09, lib/monthly-statements): one P&L, two places.
  const { data, rows } = await loadMonthlyPnl(supabase, { year, throughMonth, segment: segmentFilterFor(segment), consolidated })

  // Whoever reads the reports company-wide (2026-10-09, the user's Claude
  // Design handoff): the period From – To, the two views and the exports in
  // the head, four cards, one control row, the months separated. A
  // department manager keeps the page below, as it was.
  if (!isDeptMgr) {
    const nowYM = officeMonth()
    const range = reportRange({ from: params.from, period }, nowYM)
    const segments = [...REPORT_SEGMENTS, ...extraReportSegments(primedRegistryRows())]
    const segName = (segments.find((s) => s.value === segment) ?? segments[0]).label
    const exportHref = (format: 'xlsx' | 'pdf') => {
      const qs = new URLSearchParams({ format, period: range.to })
      if (segment) qs.set('segment', segment)
      if (!range.wholeYear) qs.set('from', range.from)
      return `/reports/monthly-pnl/export?${qs.toString()}`
    }
    return (
      <div>
        <div className="page-head">
          <div className="min-w-0">
            <div className="page-eyebrow">
              <em>I.</em> REPORTS · P&amp;L · {rangeLabel(range.from, range.to).toUpperCase()}
            </div>
            <h1 className="page-title">P&amp;L</h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ReportModeSwitch pair="pnl" active="monthly" period={range.to} segment={segment || undefined} />
            <Link href="/reports/monthly-pnl/layout" className="btn-quiet-sheet">
              Edit layout
            </Link>
            <a href={exportHref('xlsx')} className="btn-quiet-sheet">
              Excel
            </a>
            <a href={exportHref('pdf')} className="btn-quiet-sheet">
              PDF
            </a>
          </div>
        </div>

        <MonthlyPnlBody
          pnl={{ data, rows }}
          range={range}
          nowYM={nowYM}
          segmentLabel={segName}
          segment={segment}
          segments={segments}
          consolidated={consolidated}
        />
      </div>
    )
  }

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>III.</em> REPORTS · MONTHLY P&amp;L · FY {year}
          </div>
          <h1 className="page-title">Monthly P&amp;L</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            FY {year} · read-only · all amounts RM · % of sales
            {consolidated ? <> · <em className="text-accent">内部互收已抵销</em></> : null}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Edit layout edits the SHARED company P&L layout — hide from dept managers. */}
          {!isDeptMgr && (
            <Link
              href="/reports/monthly-pnl/layout"
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-md text-xs font-sans transition-colors"
            >
              Edit layout
            </Link>
          )}
          <a
            href={`/reports/monthly-pnl/export?format=xlsx&period=${period}${segment ? `&segment=${segment}` : ''}`}
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            Excel
          </a>
          <a
            href={`/reports/monthly-pnl/export?format=pdf&period=${period}${segment ? `&segment=${segment}` : ''}`}
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            PDF
          </a>
        </div>
      </div>

      <ReportViewToggle pair="pnl" active="monthly" period={period} segment={segment || undefined} />

      <p className="font-serif italic text-muted text-sm mb-6 max-w-3xl">
        Each month of the fiscal year as its own column, with an Accumulated
        (year-to-date) column. Grouped under your own categories (edit the layout
        to drag accounts around — subtotals recompute automatically). Cost /
        expense show negative; % is each line against that column&rsquo;s sales.
      </p>

      {/* Provider bridges the rail's search box to the matrix that owns the rows. */}
      <ReportSearchProvider>
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-stretch lg:items-start">
          <MonthlyReportControls period={period} segment={segment} hideSegment={isDeptMgr} extraSegments={extraReportSegments(primedRegistryRows())} />
          <div className="min-w-0 flex-1">
            <MonthlyMatrix columns={data.columns} rows={rows} pctBaseByColumn={data.salesByColumn} nowKey={period} />
          </div>
        </div>
      </ReportSearchProvider>
    </div>
  )
}
