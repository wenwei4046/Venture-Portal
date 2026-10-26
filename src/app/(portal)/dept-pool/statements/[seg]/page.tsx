import { notFound } from 'next/navigation'
import { requireActionOn, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeMonth } from '@/lib/office-time'
import { primedRegistryRows } from '@/lib/dept-registry'
import { statementDepts, statementPath, type StatementView } from '@/lib/dept-statements'
import { loadMonthlyCashFlow, loadMonthlyPnl } from '@/lib/monthly-statements'
import { rangeLabel, reportRange, toChoices } from '@/lib/report-range'
import { segmentFilterFor } from '../../../reports/_components/report-segments'
import { openDeptPoolRow } from '../../../reports/drill-actions'
import DeptPeriodBar from './_components/DeptPeriodBar'
import { DeptCashFlowBody, DeptPnlBody } from './_components/DeptStatementBody'

// A department's own P&L and Cash Flow, under Dept Pool (2026-10-09, the
// user: 我要把每个 department 的 cash flow, P&L 放过来 — Venture, Marketing,
// Finance, HR, Director Office, IT, Revenue Department, each with both). The
// month-by-month statements of Reports, read through the same loader for this
// one segment, so the figures are the ones Reports shows with it picked; the
// switch between the two keeps the period.
//
// For whoever reads the reports company-wide AND every department's pool
// (Finance, the Principal).
//
// 2026-10-25 (the user: "department 那边我要做成像 venture pool 这样用 diagram
// 和 chart 的"; the mockup's twelfth round, "这一版可以了，开始做"): the title
// names the statement ("Marketing - Cash Flow"), the switch sits in the period
// row with 6 / 12 months — which may reach back across the year — and the
// charts stand between the cards and the statement.

export const dynamic = 'force-dynamic'

const YM = /^\d{4}-\d{2}$/

interface Props {
  params: Promise<{ seg: string }>
  searchParams: Promise<{ view?: string; period?: string; from?: string }>
}

export default async function DeptStatementPage({ params, searchParams }: Props) {
  await requirePage('/dept-pool/statements/[seg]')
  const user = await requireActionOn('/dept-pool/statements/[seg]', 'reports', 'view')
  if (!canDo(user, 'dept_pool', 'view')) notFound()

  const { seg } = await params
  const supabase = await createClient()
  const dept = statementDepts(primedRegistryRows()).find((d) => d.slug === seg)
  if (!dept) notFound()

  const sp = await searchParams
  // The Cash Flow first (2026-10-12, user: default 开 cash flow 先); an old
  // ?view=cash-flow link lands there too.
  const view: StatementView = sp.view === 'pnl' ? 'pnl' : 'cash-flow'
  const nowYM = officeMonth()
  const period = YM.test(sp.period ?? '') ? (sp.period as string) : nowYM
  const range = reportRange({ from: sp.from, period }, nowYM, { crossYear: true })
  const args = {
    year: range.year,
    throughMonth: range.throughMonth,
    segment: segmentFilterFor(dept.segment),
    consolidated: false,
    ...(range.buildFrom ? { from: range.buildFrom } : {}),
  }
  // What the switch keeps: the period as the address gave it.
  const kept = { period: YM.test(sp.period ?? '') ? period : undefined, from: range.wholeYear ? undefined : range.from }
  const exportHref = (format: 'xlsx' | 'pdf') => {
    const qs = new URLSearchParams({ format, period: range.to })
    qs.set('segment', dept.segment)
    if (!range.wholeYear) qs.set('from', range.from)
    return `/reports/${view === 'pnl' ? 'monthly-pnl' : 'monthly-cash-flow'}/export?${qs.toString()}`
  }

  const head = (
    <>
      <div className="page-head">
        <div className="min-w-0">
          <div className="page-eyebrow">
            <em>I.</em> DEPARTMENTS · {dept.label.toUpperCase()} · {rangeLabel(range.from, range.to).toUpperCase()}
          </div>
          <h1 className="page-title">
            {dept.label} - {view === 'pnl' ? 'Profit & Loss' : 'Cash Flow'}
          </h1>
        </div>
        {/* The files for whoever may take them out — the route asks Dept reports · Export (2026-10-16). */}
        {canDo(user, 'dept_reports', 'export') ? (
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
      <DeptPeriodBar
        view={view}
        links={{ pnl: statementPath(dept.slug, 'pnl', kept), 'cash-flow': statementPath(dept.slug, 'cash-flow', kept) }}
        from={range.from}
        to={range.to}
        toOptions={toChoices(nowYM)}
      />
    </>
  )

  // An account opens onto its months and lines for this segment (2026-10-24), through this page's own action.
  const drill = { open: openDeptPoolRow, segment: dept.segment }

  if (view === 'cash-flow') {
    const cashFlow = await loadMonthlyCashFlow(supabase, args)
    return (
      <div className="dept-page">
        {head}
        <DeptCashFlowBody cashFlow={cashFlow} range={range} nowYM={nowYM} label={dept.label} drill={drill} />
      </div>
    )
  }

  const pnl = await loadMonthlyPnl(supabase, args)
  return (
    <div className="dept-page">
      {head}
      <DeptPnlBody pnl={pnl} range={range} nowYM={nowYM} label={dept.label} drill={drill} />
    </div>
  )
}
