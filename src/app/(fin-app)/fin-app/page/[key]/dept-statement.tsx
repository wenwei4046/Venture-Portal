import { notFound } from 'next/navigation'
import { requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeMonth } from '@/lib/office-time'
import { primedRegistryRows } from '@/lib/dept-registry'
import { statementDepts } from '@/lib/dept-statements'
import { readCashFlowStatement, readPnlStatement } from '@/app/(portal)/reports/_lib/statement-reads'
import { cashFlowModel, pnlModel } from '@/lib/fin-app/report-model'
import { fromReportModel } from '@/lib/fin-app/report-pages'
import { deptStatementPlace, deptStatementView, type DeptStatementView } from '@/lib/fin-app/dept-statement'
import { askedMonth, searchOf, type SearchParams } from '@/lib/fin-app/report-page'
import type { PageModel } from '@/lib/fin-app/page-model'
import type { User } from '@/types'
import PageApp from '@/components/fin-app/PageApp'

/**
 * `/fin-app/page/dp-<slug>` — Department › a department's own page in the
 * Finance phone app (2026-10-15, part E3): the desktop page's gates (its tabs,
 * Reports and Dept Pool), its two statements for this one segment — the Cash
 * Flow first, the P&L a press away (the desktop's switch, the user's 2026-10-12
 * "default 开 cash flow 先") — read as Reports reads them with the segment
 * picked (`readCashFlowStatement` / `readPnlStatement`), a month at a time
 * between the arrows, and the desktop page's files for whoever may export.
 */
export default async function DeptStatementScreen({ slug, sp, user }: { slug: string; sp: SearchParams; user: User }) {
  await requirePage('/dept-pool/statements/[seg]')
  if (!canDo(user, 'reports', 'view') || !canDo(user, 'dept_pool', 'view')) notFound()
  const dept = statementDepts(primedRegistryRows()).find((d) => d.slug === slug)
  if (!dept) notFound()

  const view: DeptStatementView = deptStatementView(sp.view)
  const thisMonth = officeMonth()
  const ym = askedMonth(sp, thisMonth)
  const supabase = await createClient()
  const ask = { period: ym, compare: '', segment: dept.segment }

  let report: PageModel
  if (view === 'pnl') {
    const { pnl } = await readPnlStatement(supabase, user, ask)
    report = fromReportModel(pnlModel(pnl, ym))
  } else {
    const { cf, inflow, outflow } = await readCashFlowStatement(supabase, user, ask)
    report = fromReportModel(cashFlowModel(cf, { inflow, outflow }, ym, ym === thisMonth))
  }
  // Whose figures they are, under the headline and over a list (the desktop's eyebrow names the department).
  const model: PageModel = { ...report, hero: { ...report.hero, label: `${report.hero.label} · ${dept.label}` }, eyebrow: `${dept.label} · ${report.eyebrow}` }
  const place = deptStatementPlace({ slug, title: dept.label, view, ym, thisMonth })

  // The desktop page's files: the month-by-month statement of this segment, the year through this month.
  const base = view === 'pnl' ? '/reports/monthly-pnl/export' : '/reports/monthly-cash-flow/export'
  const file = (format: 'pdf' | 'xlsx') => `${base}?${new URLSearchParams({ format, period: ym, segment: dept.segment }).toString()}`
  const files = canDo(user, 'dept_reports', 'export', 'dept')
    ? [
        { key: 'pdf', label: 'Export PDF', href: file('pdf'), format: 'pdf' as const },
        { key: 'xlsx', label: 'Export Excel', href: file('xlsx'), format: 'xlsx' as const },
      ]
    : []

  return (
    <PageApp
      key={`${view}:${ym}`}
      place={place.place}
      model={model}
      search={searchOf(sp)}
      files={files}
      bar={[{ key: 'view', label: place.switchLabel, href: place.switchHref, replace: true, kind: 'primary' }]}
    />
  )
}
