import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireActionOn, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeMonth } from '@/lib/office-time'
import { primedRegistryRows } from '@/lib/dept-registry'
import { statementDepts, statementPath, type StatementView } from '@/lib/dept-statements'
import { loadMonthlyCashFlow, loadMonthlyPnl } from '@/lib/monthly-statements'
import { rangeLabel, reportRange } from '@/lib/report-range'
import { segmentFilterFor } from '../../../reports/_components/report-segments'
import MonthlyPnlBody from '../../../reports/_components/MonthlyPnlBody'
import MonthlyCashFlowBody from '../../../reports/_components/MonthlyCashFlowBody'

// A department's own P&L and Cash Flow, under Dept Pool (2026-10-09, the
// user: 我要把每个 department 的 cash flow, P&L 放过来 — Venture, Marketing,
// Finance, HR, Director Office, IT, Revenue Department, each with both). The
// month-by-month statements of Reports, read through the same loader for this
// one segment, so the figures are the ones Reports shows with it picked; the
// switch between the two keeps the period.
//
// For whoever reads the reports company-wide AND every department's pool
// (Finance, the Principal); a department manager keeps their own pages.

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
  const range = reportRange({ from: sp.from, period }, nowYM)
  const args = {
    year: range.year,
    throughMonth: range.throughMonth,
    segment: segmentFilterFor(dept.segment),
    consolidated: false,
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
    <div className="page-head">
      <div className="min-w-0">
        <div className="page-eyebrow">
          <em>I.</em> DEPARTMENTS · {dept.label.toUpperCase()} · {rangeLabel(range.from, range.to).toUpperCase()}
        </div>
        <h1 className="page-title">{dept.label}</h1>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="rpt-modes" role="group" aria-label="Statement">
          {([
            ['pnl', 'P&L'],
            ['cash-flow', 'Cash Flow'],
          ] as const).map(([v, label]) => (
            <Link
              key={v}
              href={statementPath(dept.slug, v, kept)}
              aria-current={view === v ? 'page' : undefined}
              className={view === v ? 'btn-pri-sheet' : 'btn-quiet-sheet'}
            >
              {label}
            </Link>
          ))}
        </div>
        <a href={exportHref('xlsx')} className="btn-quiet-sheet">
          Excel
        </a>
        <a href={exportHref('pdf')} className="btn-quiet-sheet">
          PDF
        </a>
      </div>
    </div>
  )

  if (view === 'cash-flow') {
    const cashFlow = await loadMonthlyCashFlow(supabase, args)
    return (
      <div>
        {head}
        <MonthlyCashFlowBody cashFlow={cashFlow} range={range} nowYM={nowYM} segmentLabel={dept.label} />
      </div>
    )
  }

  const pnl = await loadMonthlyPnl(supabase, args)
  return (
    <div>
      {head}
      <MonthlyPnlBody pnl={pnl} range={range} nowYM={nowYM} segmentLabel={dept.label} />
    </div>
  )
}
