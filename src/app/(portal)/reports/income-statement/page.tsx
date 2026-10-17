// GL-driven P&L (2026-06-11 rebuild). Every figure aggregates journal_lines —
// the same dataset the Trial Balance ties to. Format per the-conts.pages.dev
// reference: current | comparison | Δ% | % of revenue, collapsible groups,
// inline transaction drill-down. The old subledger/manual_jv hybrid engine
// (cfo-reports.fetchIncomeStatement) is no longer used here.

import dayjs from 'dayjs'
import { notFound } from 'next/navigation'
import { canDo } from '@/lib/permission-actions'
import { officeMonth } from '@/lib/office-time'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
import { reportsCompanyWide } from '@/lib/surfaces'
import GlReportView from '../_components/GlReportView'
import { REPORT_SEGMENTS } from '../_components/report-segments'
import { extraReportSegments, primedRegistryRows } from '@/lib/dept-registry'
import ExportLinks from '../_components/ExportLinks'
import { readPnlStatement } from '../_lib/statement-reads'
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
  // For whoever reads the reports company-wide (Reports · View at All); the
  // Dept Manager's own-segment page went with the kind (2026-10-17).
  if (!reportsCompanyWide(user)) notFound()
  // The files only for whoever may take them out — as the export route asks (2026-10-16).
  const canExport = canDo(user, 'reports', 'export')
  const supabase = await createClient()

  const params = await searchParams
  const period = params.period ?? officeMonth()
  // Comparison is OPT-IN (user 2026-06-11): default is a clean single-month view.
  const compare = params.compare ?? ''
  // The read is the Finance phone app's P&L's too (`_lib/statement-reads`).
  const { pnl, blocks, segment } = await readPnlStatement(supabase, user, { period, compare, segment: params.segment ?? '' })
  const periodLabel = dayjs(`${period}-01`).format('MMMM YYYY')

  // The page (2026-10-09, the user's Claude Design handoff): the two views and
  // the exports in the head, the cards, the controls on one row over the
  // statement.
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
          {canExport ? (
            <ExportLinks variant="sheet" basePath="/reports/income-statement/export" period={period} compare={compare} segment={segment} />
          ) : null}
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
          period={period}
          compare={compare}
          segment={segment}
          segments={segChoices}
          blocks={blocks}
          pctBase={{ current: pnl.revenue.current, previous: pnl.revenue.previous }}
          currentLabel={dayjs(`${period}-01`).format('MMM YYYY')}
          compareLabel={compare ? dayjs(`${compare}-01`).format('MMM YYYY') : ''}
        />
      </section>
    </div>
  )
}
