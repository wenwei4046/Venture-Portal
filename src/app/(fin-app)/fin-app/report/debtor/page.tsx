import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeMonth, officeToday } from '@/lib/office-time'
import { debtorAgingView, invoicesAsAt, resolveAgingAsAt } from '@/lib/debtor-aging'
import { readDebtorInvoices } from '@/app/(portal)/reports/debtor-aging/_lib/debtor-read'
import { debtorModel } from '@/lib/fin-app/report-model'
import { askedMonth, reportFiles, searchOf, type SearchParams } from '@/lib/fin-app/report-page'
import ReportApp from '@/components/fin-app/ReportApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/report/debtor` — Report › Debtor aging in the Finance phone app
 * (2026-10-15, M16): Debtor Aging's own page asked first, its read
 * (`readDebtorInvoices`), as at the month asked by the user's rule — the
 * invoices dated by then, at what is unpaid on them today, aged to that day
 * (finance-view.md › AS AT ON THE AGINGS) — by days since the invoice, as the
 * page's company-wide view; the files whoever may export them.
 */
export default async function FinAppDebtorAging({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage('/reports/debtor-aging')
  const user = await requirePermission('dept_reports')
  const sp = await searchParams
  const thisMonth = officeMonth()
  const ym = askedMonth(sp, thisMonth)
  const today = officeToday()
  const asAt = resolveAgingAsAt(ym, today)
  const past = asAt !== today
  const supabase = await createClient()
  const raw = await readDebtorInvoices(supabase)
  const view = debtorAgingView(invoicesAsAt(raw, asAt), asAt, 'days')
  const asAtQuery = { as_at: past ? asAt.slice(0, 7) : '' }
  return (
    <ReportApp
      key={ym}
      model={debtorModel(view, asAt, past)}
      search={searchOf(sp)}
      month={{ ym, thisMonth }}
      segment={null}
      files={
        canDo(user, 'dept_reports', 'export', 'dept')
          ? reportFiles('/reports/debtor-aging/export', { view: 'detail', ...asAtQuery }, [{ key: 'summary', label: 'Summary', query: { view: 'summary' } }])
          : []
      }
    />
  )
}
