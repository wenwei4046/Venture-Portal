import { officeMonth } from '@/lib/office-time'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { fetchAllJournalLines, fetchCoaAccounts } from '@/lib/gl-reports'
import { eliminateInterBilling, fetchInterBillingElimination } from '@/lib/consolidation'
import { buildPnlAccounts, buildCustomPnlRows, defaultPnlLayout } from '@/lib/pnl-custom'
import { readReportLayout, type ReportLayout } from '@/lib/report-layouts'
import { segmentFilterFor } from '../_components/report-segments'
import { extraReportSegments, primedRegistryRows } from '@/lib/dept-registry'
import MonthlyMatrix from '../_components/MonthlyMatrix'
import MonthlyReportControls from '../_components/MonthlyReportControls'
import { ReportSearchProvider } from '../_components/ReportSearchProvider'
import ReportViewToggle from '../_components/ReportViewToggle'
import { reportsCompanyWide } from '@/lib/surfaces'
import { formatMoney } from '@/lib/utils'
import { r2, sliceMatrixMonths } from '@/lib/monthly-matrix'
import { fromChoices, rangeLabel, reportRange, toChoices } from '@/lib/report-range'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import { REPORT_SEGMENTS } from '../_components/report-segments'
import ReportToolbar from '../_components/ReportToolbar'
import ReportModeSwitch from '../_components/ReportModeSwitch'
import dayjs from 'dayjs'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ period?: string; segment?: string; from?: string }>
}

export default async function MonthlyPnlPage({ searchParams }: Props) {
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

  // Whoever reads the reports company-wide (2026-10-09, the user's Claude
  // Design handoff): the period From – To, the two views and the exports in
  // the head, four cards, one control row, the months separated. A
  // department manager keeps the page below, as it was.
  if (!isDeptMgr) {
    const nowYM = officeMonth()
    const range = reportRange({ from: params.from, period }, nowYM)
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
    const segments = [...REPORT_SEGMENTS, ...extraReportSegments(primedRegistryRows())]
    const segName = (segments.find((s) => s.value === segment) ?? segments[0]).label
    const exportHref = (format: 'xlsx' | 'pdf') => {
      const qs = new URLSearchParams({ format, period: range.to })
      if (segment) qs.set('segment', segment)
      if (!range.wholeYear) qs.set('from', range.from)
      return `/reports/monthly-pnl/export?${qs.toString()}`
    }
    const margin = Math.abs(rev[0]) < 0.005 ? '—' : `${((netCut[0] / rev[0]) * 100).toFixed(1)}%`
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

        <StatCards label="P&L">
          <StatCard label={`Revenue · ${toName}`} value={formatMoney(rev[1] ?? 0)} icon="receipt" tone="ledger" note={`Accumulated ${formatMoney(rev[0])}`} />
          <StatCard label={`Expenses · ${toName}`} value={formatMoney(exp[1] ?? 0)} icon="wallet" tone="danger" note={`Accumulated ${formatMoney(exp[0])}`} />
          <StatCard label="Net profit · accumulated" value={formatMoney(netCut[0])} icon="chart" tone={netCut[0] < 0 ? 'danger' : 'primary'} note="Selected period" />
          <StatCard label="Net margin · accumulated" value={margin} icon="percent" note="Against accumulated sales" />
        </StatCards>

        <ReportSearchProvider level={3}>
          <section className="mb-6">
            <div className="sect-head">
              <h2>Monthly P&amp;L</h2>
              <span className="rule" aria-hidden />
              <span className="count">
                {segName.toUpperCase()} · {rangeLabel(range.from, range.to).toUpperCase()}
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
            {consolidated ? (
              <p className="fin-notice mb-3">Consolidated view eliminates inter-billing between segments — pick a segment to see its own charges.</p>
            ) : null}
            <MonthlyMatrix columns={cut.columns} rows={cut.rows} pctBaseByColumn={cut.base} nowKey={nowYM} separated />
          </section>
        </ReportSearchProvider>
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
