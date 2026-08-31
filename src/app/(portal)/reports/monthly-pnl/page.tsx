import dayjs from 'dayjs'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { fetchAllJournalLines, fetchCoaAccounts } from '@/lib/gl-reports'
import { eliminateInterBilling, fetchInterBillingElimination } from '@/lib/consolidation'
import { buildPnlAccounts, buildCustomPnlRows, defaultPnlLayout } from '@/lib/pnl-custom'
import { readReportLayout, type ReportLayout } from '@/lib/report-layouts'
import { segmentFilterFor } from '../_components/report-segments'
import { extraReportSegments, primedRegistryRows } from '@/lib/dept-registry'
import MonthlyMatrix from '../_components/MonthlyMatrix'
import MonthlyReportControls from '../_components/MonthlyReportControls'
import { ReportSearchProvider } from '../_components/ReportSearchProvider'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ period?: string; segment?: string }>
}

export default async function MonthlyPnlPage({ searchParams }: Props) {
  const user = await requireRole(['principal', 'finance', 'dept_manager'])
  const supabase = await createClient()

  const params = await searchParams
  const period = /^\d{4}-\d{2}$/.test(params.period ?? '') ? params.period! : dayjs().format('YYYY-MM')
  // Dept managers see ONLY their own segment (RLS) — force empty + hide picker.
  const isDeptMgr = user.role === 'dept_manager'
  const segment = isDeptMgr ? '' : (params.segment ?? '')
  const year = Number(period.slice(0, 4))
  const throughMonth = Number(period.slice(5, 7))

  // Consolidated = all-segments view for finance/principal; dept managers'
  // empty segment is their OWN view via RLS — never eliminate for them.
  const consolidated = !isDeptMgr && !segment
  const [rawLines, accounts, savedRaw, elim] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    readReportLayout(supabase, 'pnl'),
    consolidated ? fetchInterBillingElimination(supabase) : Promise.resolve(null),
  ])
  const lines = elim ? eliminateInterBilling(rawLines, elim) : rawLines

  const data = buildPnlAccounts(lines, accounts, { year, throughMonth, segment: segmentFilterFor(segment) })
  const saved = (savedRaw ?? null) as ReportLayout | null
  const layout = saved && Array.isArray(saved.categories) && saved.categories.length > 0
    ? saved
    : defaultPnlLayout(data.accounts)
  const rows = buildCustomPnlRows(data, layout)

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
            <MonthlyMatrix columns={data.columns} rows={rows} pctBaseByColumn={data.salesByColumn} />
          </div>
        </div>
      </ReportSearchProvider>
    </div>
  )
}
