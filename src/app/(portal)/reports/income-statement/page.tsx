// GL-driven P&L (2026-06-11 rebuild). Every figure aggregates journal_lines —
// the same dataset the Trial Balance ties to. Format per the-conts.pages.dev
// reference: current | comparison | Δ% | % of revenue, collapsible groups,
// inline transaction drill-down. The old subledger/manual_jv hybrid engine
// (cfo-reports.fetchIncomeStatement) is no longer used here.

import dayjs from 'dayjs'
import { officeMonth } from '@/lib/office-time'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { applyGlRefs, buildPnl, fetchAllJournalLines, fetchCoaAccounts, fetchGlRefs, monthPeriod } from '@/lib/gl-reports'
import { eliminateInterBilling, fetchInterBillingElimination } from '@/lib/consolidation'
import { pnlBlocks } from '@/lib/gl-report-blocks'
import GlReportView from '../_components/GlReportView'
import { REPORT_SEGMENTS, segmentFilterFor } from '../_components/report-segments'
import { extraReportSegments, primedRegistryRows } from '@/lib/dept-registry'
import ExportLinks from '../_components/ExportLinks'
import ReportViewToggle from '../_components/ReportViewToggle'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ period?: string; compare?: string; segment?: string }>
}

export default async function IncomeStatementPage({ searchParams }: Props) {
  const user = await requirePermission('dept_reports')
  const supabase = await createClient()

  const params = await searchParams
  const period = params.period ?? officeMonth()
  // Comparison is OPT-IN (user 2026-06-11): default is a clean single-month view.
  const compare = params.compare ?? ''
  // Dept managers see ONLY their own segment (RLS-enforced on journal_lines);
  // force the filter empty + hide the segment picker so the report is theirs
  // and a hand-typed ?segment= can't select another dept (it just returns empty).
  const isDeptMgr = user.role === 'dept_manager'
  const segment = isDeptMgr ? '' : (params.segment ?? '')

  // Consolidated = the true all-segments view (finance/principal, no segment
  // picked). Dept managers' empty segment is their OWN view via RLS — never
  // eliminate for them.
  const consolidated = !isDeptMgr && !segment
  const [rawLines, accounts, glRefs, elim] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    fetchGlRefs(supabase),
    consolidated ? fetchInterBillingElimination(supabase) : Promise.resolve(null),
  ])
  let lines = applyGlRefs(rawLines, glRefs)
  if (elim) lines = eliminateInterBilling(lines, elim)

  const pnl = buildPnl(lines, accounts, {
    current: monthPeriod(period),
    previous: monthPeriod(compare || period),
    segment: segmentFilterFor(segment),
  })

  const blocks = pnlBlocks(pnl)
  const periodLabel = dayjs(`${period}-01`).format('MMMM YYYY')

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted hover:text-accent font-sans transition-colors">
        ← Back to Reports
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REPORTS · P&amp;L STATEMENT · {periodLabel.toUpperCase()}
          </div>
          <h1 className="page-title">P&amp;L Statement</h1>
        </div>
        <ExportLinks basePath="/reports/income-statement/export" period={period} compare={compare} segment={segment} />
      </div>

      <ReportViewToggle pair="pnl" active="single" period={period} segment={segment || undefined} />

      <p className="font-serif italic text-muted text-sm mb-6 max-w-3xl">
        Built straight from the general ledger — the same journal lines the Trial Balance ties to.
        Gross profit = revenue − COGS; net income adds other income and deducts expenses.
        Click ▸ on an account to see its journal transactions for the period.
        {consolidated ? (
          <> <em className="text-accent">合并视图已抵销部门间互收 — inter-billing between segments is eliminated here; pick a segment to see its own charges.</em></>
        ) : null}
      </p>

      <GlReportView
        basePath="/reports/income-statement"
        period={period}
        compare={compare}
        segment={segment}
        segments={isDeptMgr ? [] : [...REPORT_SEGMENTS, ...extraReportSegments(primedRegistryRows())]}
        blocks={blocks}
        pctBase={{ current: pnl.revenue.current, previous: pnl.revenue.previous }}
        currentLabel={dayjs(`${period}-01`).format('MMM YYYY')}
        compareLabel={compare ? dayjs(`${compare}-01`).format('MMM YYYY') : ''}
      />
    </div>
  )
}
