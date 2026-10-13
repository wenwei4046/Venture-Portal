// GL-driven P&L (2026-06-11 rebuild). Every figure aggregates journal_lines —
// the same dataset the Trial Balance ties to. Format per the-conts.pages.dev
// reference: current | comparison | Δ% | % of revenue, collapsible groups,
// inline transaction drill-down. The old subledger/manual_jv hybrid engine
// (cfo-reports.fetchIncomeStatement) is no longer used here.

import dayjs from 'dayjs'
import { officeMonth } from '@/lib/office-time'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
import { listsPayrollByPerson } from '@/lib/roles'
import { applyGlRefs, buildPnl, fetchAllJournalLines, fetchCoaAccounts, fetchGlRefs, monthPeriod } from '@/lib/gl-reports'
import { eliminateInterBilling, fetchInterBillingElimination } from '@/lib/consolidation'
import { pnlBlocks } from '@/lib/gl-report-blocks'
import GlReportView from '../_components/GlReportView'
import { REPORT_SEGMENTS, segmentFilterFor } from '../_components/report-segments'
import { extraReportSegments, primedRegistryRows } from '@/lib/dept-registry'
import ExportLinks from '../_components/ExportLinks'
import ReportViewToggle from '../_components/ReportViewToggle'
import { reportsCompanyWide } from '@/lib/surfaces'
import { formatMoney } from '@/lib/utils'
import { StatCard, StatCards } from '@/components/sheet/StatCard'
import ReportModeSwitch from '../_components/ReportModeSwitch'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ period?: string; compare?: string; segment?: string }>
}

export default async function IncomeStatementPage({ searchParams }: Props) {
  await requirePage('/reports/income-statement')
  const user = await requirePermission('dept_reports')
  const supabase = await createClient()

  const params = await searchParams
  const period = params.period ?? officeMonth()
  // Comparison is OPT-IN (user 2026-06-11): default is a clean single-month view.
  const compare = params.compare ?? ''
  // Dept managers see ONLY their own segment (RLS-enforced on journal_lines);
  // force the filter empty + hide the segment picker so the report is theirs
  // and a hand-typed ?segment= can't select another dept (it just returns empty).
  const isDeptMgr = !reportsCompanyWide(user) // own segment only (Q7: by cell, not kind)
  const segment = isDeptMgr ? '' : (params.segment ?? '')

  // Consolidated = the true all-segments view (finance/principal, no segment
  // picked). Dept managers' empty segment is their OWN view via RLS — never
  // eliminate for them.
  const consolidated = !isDeptMgr && !segment
  const [rawLines, accounts, glRefs, elim] = await Promise.all([
    fetchAllJournalLines(supabase),
    fetchCoaAccounts(supabase),
    // Salary lines by department for whoever reads payroll that way (2026-10-13).
    fetchGlRefs(supabase, { payrollByPerson: listsPayrollByPerson(user) }),
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

  // Whoever reads the reports company-wide (2026-10-09, the user's Claude
  // Design handoff): the two views and the exports in the head, the cards,
  // the controls on one row over the statement. A department manager keeps
  // the page below, as it was.
  if (!isDeptMgr) {
    const segChoices = [...REPORT_SEGMENTS, ...extraReportSegments(primedRegistryRows())]
    const segName = (segChoices.find((s) => s.value === segment) ?? segChoices[0]).label
    const isNow = period === officeMonth()
    const mon = dayjs(`${period}-01`).format('MMM')
    const revenue = pnl.revenue.current
    const expenses = Math.round((pnl.cost.current + pnl.expense.current) * 100) / 100
    const net = pnl.netIncome.current
    const note = `${periodLabel}${isNow ? ' · to date' : ''}`
    return (
      <div>
        <div className="page-head">
          <div className="min-w-0">
            <div className="page-eyebrow">
              <em>I.</em> REPORTS · P&amp;L · {periodLabel.toUpperCase()}
            </div>
            <h1 className="page-title">P&amp;L</h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ReportModeSwitch pair="pnl" active="single" period={period} segment={segment || undefined} />
            <ExportLinks variant="sheet" basePath="/reports/income-statement/export" period={period} compare={compare} segment={segment} />
          </div>
        </div>

        <StatCards label="P&L">
          <StatCard label={`Revenue · ${mon}${isNow ? ' (to date)' : ''}`} value={formatMoney(revenue)} icon="receipt" tone="ledger" note={note} />
          <StatCard label={`Expenses · ${mon}${isNow ? ' (to date)' : ''}`} value={formatMoney(expenses)} icon="wallet" tone="danger" note={note} />
          <StatCard label={`Net profit · ${mon}`} value={formatMoney(net)} icon="chart" tone={net < 0 ? 'danger' : 'primary'} note="Revenue − expenses" />
          <StatCard
            label={`Net margin · ${mon}`}
            value={Math.abs(revenue) < 0.005 ? '—' : `${((net / revenue) * 100).toFixed(1)}%`}
            icon="percent"
            note={isNow ? 'This month' : periodLabel}
          />
        </StatCards>

        <section className="mb-6">
          <div className="sect-head">
            <h2>Income statement</h2>
            <span className="rule" aria-hidden />
            <span className="count">
              {segName.toUpperCase()} · {periodLabel.toUpperCase()}
            </span>
          </div>
          <GlReportView
            basePath="/reports/income-statement"
            period={period}
            compare={compare}
            segment={segment}
            segments={segChoices}
            blocks={blocks}
            pctBase={{ current: pnl.revenue.current, previous: pnl.revenue.previous }}
            currentLabel={dayjs(`${period}-01`).format('MMM YYYY')}
            compareLabel={compare ? dayjs(`${compare}-01`).format('MMM YYYY') : ''}
            controls="row"
          />
        </section>
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
            <em>I.</em> REPORTS · P&amp;L STATEMENT · {periodLabel.toUpperCase()}
          </div>
          <h1 className="page-title">P&amp;L Statement</h1>
        </div>
        <ExportLinks basePath="/reports/income-statement/export" period={period} compare={compare} segment={segment} />
      </div>

      <ReportViewToggle pair="pnl" active="single" period={period} segment={segment || undefined} />

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
