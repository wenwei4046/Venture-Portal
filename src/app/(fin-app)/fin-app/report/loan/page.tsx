import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeMonth, officeToday } from '@/lib/office-time'
import { resolveAgingAsAt } from '@/lib/debtor-aging'
import { fetchLoanMonitorData } from '@/lib/loan-monitor'
import { loanModel } from '@/lib/fin-app/report-model'
import { askedMonth, reportFiles, searchOf, type SearchParams } from '@/lib/fin-app/report-page'
import ReportApp from '@/components/fin-app/ReportApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/report/loan` — Report › Loan aging in the Finance phone app
 * (2026-10-15): Loan Aging's own page asked first (its tabs, Reports), the
 * loan monitor read as at the month asked — exactly, every repayment is dated
 * — the loans outstanding over the days late, what HV owes late, and every
 * open balance; the files whoever may export them.
 */
export default async function FinAppLoanAging({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage('/reports/loan-aging')
  const user = await requirePermission('reports')
  const sp = await searchParams
  const thisMonth = officeMonth()
  const ym = askedMonth(sp, thisMonth)
  const today = officeToday()
  const asAt = resolveAgingAsAt(ym, today)
  const past = asAt !== today
  const supabase = (await createClient()) as unknown as SupabaseClient
  const data = await fetchLoanMonitorData(supabase, { asOf: asAt })
  const asAtQuery = { as_at: past ? asAt.slice(0, 7) : '' }
  return (
    <ReportApp
      key={ym}
      model={loanModel(data, asAt)}
      search={searchOf(sp)}
      month={{ ym, thisMonth }}
      segment={null}
      files={
        canDo(user, 'reports', 'export')
          ? reportFiles('/reports/loan-aging/export', { view: 'aging', ...asAtQuery }, [{ key: 'outstanding', label: 'Outstanding', query: { view: 'outstanding' } }])
          : []
      }
    />
  )
}
