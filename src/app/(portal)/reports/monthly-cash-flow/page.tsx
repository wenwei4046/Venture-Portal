import { officeMonth } from '@/lib/office-time'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
import { loadMonthlyCashFlow } from '@/lib/monthly-statements'
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
import MonthlyCashFlowBody from '../_components/MonthlyCashFlowBody'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ period?: string; segment?: string; from?: string }>
}

export default async function MonthlyCashFlowPage({ searchParams }: Props) {
  await requirePage('/reports/monthly-cash-flow')
  const user = await requirePermission('dept_reports')
  const supabase = await createClient()

  const params = await searchParams
  const period = /^\d{4}-\d{2}$/.test(params.period ?? '') ? params.period! : officeMonth()
  // Dept managers see ONLY their own segment (RLS) — force empty + hide picker.
  const isDeptMgr = !reportsCompanyWide(user) // own segment only (Q7: by cell, not kind)
  const segment = isDeptMgr ? '' : (params.segment ?? '')
  const year = Number(period.slice(0, 4))
  const throughMonth = Number(period.slice(5, 7))

  // Internal-transfer bridge: per-segment only — it cancels across segments,
  // so the consolidated view must not carry it (same rule as the statement),
  // and there it is not read at all (2026-10-08).
  const consolidated = !isDeptMgr && !segment
  // The read a department's own page under Dept Pool makes for its segment
  // too (2026-10-09, lib/monthly-statements): one Cash Flow, two places.
  const { data, rows } = await loadMonthlyCashFlow(supabase, { year, throughMonth, segment: segmentFilterFor(segment), consolidated })

  // Whoever reads the reports company-wide (2026-10-09, the user's Claude
  // Design handoff): the period From – To, the two views and the exports in
  // the head, the cards, one control row, the months separated. A department
  // manager keeps the page below, as it was.
  if (!isDeptMgr) {
    const nowYM = officeMonth()
    const range = reportRange({ from: params.from, period }, nowYM)
    const segments = [...REPORT_SEGMENTS, ...extraReportSegments(primedRegistryRows())]
    const segName = (segments.find((s) => s.value === segment) ?? segments[0]).label
    const exportHref = (format: 'xlsx' | 'pdf') => {
      const qs = new URLSearchParams({ format, period: range.to })
      if (segment) qs.set('segment', segment)
      if (!range.wholeYear) qs.set('from', range.from)
      return `/reports/monthly-cash-flow/export?${qs.toString()}`
    }
    return (
      <div>
        <div className="page-head">
          <div className="min-w-0">
            <div className="page-eyebrow">
              <em>I.</em> REPORTS · CASH FLOW · {rangeLabel(range.from, range.to).toUpperCase()}
            </div>
            <h1 className="page-title">Cash Flow</h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ReportModeSwitch pair="cash-flow" active="monthly" period={range.to} segment={segment || undefined} />
            <Link href="/reports/cash-flow/layout" className="btn-quiet-sheet">
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

        <MonthlyCashFlowBody
          cashFlow={{ data, rows }}
          range={range}
          nowYM={nowYM}
          segmentLabel={segName}
          segment={segment}
          segments={segments}
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
            <em>III.</em> REPORTS · MONTHLY CASH FLOW · FY {year}
          </div>
          <h1 className="page-title">Monthly Cash Flow</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            FY {year} · read-only · all amounts RM · direct method
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Edit layout edits the SHARED company layout — hide from dept managers. */}
          {!isDeptMgr && (
            <Link
              // One shared layout for both cash-flow views — edited on the statement.
              href={`/reports/cash-flow/layout`}
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-md text-xs font-sans transition-colors"
            >
              Edit layout
            </Link>
          )}
          <a
            href={`/reports/monthly-cash-flow/export?format=xlsx&period=${period}${segment ? `&segment=${segment}` : ''}`}
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            Excel
          </a>
          <a
            href={`/reports/monthly-cash-flow/export?format=pdf&period=${period}${segment ? `&segment=${segment}` : ''}`}
            className="px-3 py-1.5 bg-surface hover:bg-surface-2 border border-hairline rounded-md text-xs font-mono text-graphite hover:text-ink transition-colors"
          >
            PDF
          </a>
        </div>
      </div>

      <ReportViewToggle pair="cash-flow" active="monthly" period={period} segment={segment || undefined} />

      <p className="font-serif italic text-muted text-sm mb-6 max-w-3xl">
        Direct-method cash movement, grouped under your own categories (edit the
        layout to drag accounts between categories — subtotals recompute
        automatically). Each month is a column with an Accumulated total; inflows
        positive, outflows negative.
      </p>

      {/* Provider bridges the rail's search box to the matrix that owns the rows. */}
      <ReportSearchProvider>
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-stretch lg:items-start">
          <MonthlyReportControls period={period} segment={segment} hideSegment={isDeptMgr} extraSegments={extraReportSegments(primedRegistryRows())} />
          <div className="min-w-0 flex-1">
            <MonthlyMatrix columns={data.columns} rows={rows} nowKey={period} />
          </div>
        </div>
      </ReportSearchProvider>
    </div>
  )
}
