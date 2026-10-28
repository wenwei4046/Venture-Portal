import { notFound } from 'next/navigation'
import { requireActionOn, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeMonth } from '@/lib/office-time'
import { primedRegistryRows } from '@/lib/dept-registry'
import { statementDepts, statementPath, statementPeriod } from '@/lib/dept-statements'
import { openDeptPoolRow } from '../../../reports/drill-actions'
import { renderDeptStatement } from './_components/DeptStatementScreen'

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
//
// 2026-10-28: the page itself is drawn by renderDeptStatement, which Marketing's
// own pool draws too.

export const dynamic = 'force-dynamic'

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

  // The Cash Flow first (2026-10-12, user: default 开 cash flow 先); an old
  // ?view=cash-flow link lands there too.
  const nowYM = officeMonth()
  const { view, range, kept } = statementPeriod(await searchParams, nowYM)

  return renderDeptStatement({
    reader: supabase,
    label: dept.label,
    segment: dept.segment,
    view,
    range,
    nowYM,
    links: { pnl: statementPath(dept.slug, 'pnl', kept), 'cash-flow': statementPath(dept.slug, 'cash-flow', kept) },
    // The files for whoever may take them out — the route asks Dept reports · Export (2026-10-16).
    canExport: canDo(user, 'dept_reports', 'export'),
    exportHref: (format) => {
      const qs = new URLSearchParams({ format, period: range.to })
      qs.set('segment', dept.segment)
      if (!range.wholeYear) qs.set('from', range.from)
      return `/reports/${view === 'pnl' ? 'monthly-pnl' : 'monthly-cash-flow'}/export?${qs.toString()}`
    },
    // An account opens onto its months and lines for this segment (2026-10-24), through this page's own action.
    drill: { open: openDeptPoolRow, segment: dept.segment },
  })
}
