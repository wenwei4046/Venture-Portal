import { notFound } from 'next/navigation'
import { officeMonth } from '@/lib/office-time'
import { canDo } from '@/lib/permission-actions'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, requirePage } from '@/lib/auth'
import { loadMonthlyPnl } from '@/lib/monthly-statements'
import { segmentFilterFor } from '../_components/report-segments'
import { extraReportSegments, primedRegistryRows } from '@/lib/dept-registry'
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
  // For whoever reads the reports company-wide (Reports · View at All); the
  // Dept Manager's own-segment page went with the kind (2026-10-17).
  if (!reportsCompanyWide(user)) notFound()
  // The files only for whoever may take them out — as the export route asks (2026-10-16).
  const canExport = canDo(user, 'dept_reports', 'export')
  const supabase = await createClient()

  const params = await searchParams
  const period = /^\d{4}-\d{2}$/.test(params.period ?? '') ? params.period! : officeMonth()
  const segment = params.segment ?? ''
  const year = Number(period.slice(0, 4))
  const throughMonth = Number(period.slice(5, 7))

  // Consolidated = the all-segments view (no segment picked).
  const consolidated = !segment
  // The read a department's own page under Dept Pool makes for its segment
  // too (2026-10-09, lib/monthly-statements): one P&L, two places.
  const { data, rows } = await loadMonthlyPnl(supabase, { year, throughMonth, segment: segmentFilterFor(segment), consolidated })

  // The page (2026-10-09, the user's Claude Design handoff): the period From –
  // To, the two views and the exports in the head, four cards, one control
  // row, the months separated.
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
          {canExport ? (
            <a href={exportHref('xlsx')} className="btn-quiet-sheet">
              Excel
            </a>
          ) : null}
          {canExport ? (
            <a href={exportHref('pdf')} className="btn-quiet-sheet">
              PDF
            </a>
          ) : null}
        </div>
      </div>

      <MonthlyPnlBody
        pnl={{ data, rows }}
        range={range}
        nowYM={nowYM}
        segmentLabel={segName}
        segment={segment}
        segments={segments}
      />
    </div>
  )
}
