import { requirePage, requirePayrollPayouts } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeToday } from '@/lib/office-time'
import { readPayrollRequests } from '@/app/(portal)/payments/payroll-requests/_lib/payroll-read'
import { payrollRequestsModel } from '@/lib/fin-app/payroll-requests-model'
import { searchOf, type SearchParams } from '@/lib/fin-app/report-page'
import PayrollRequestsApp from '@/components/fin-app/PayrollRequestsApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/page/payroll-requests` — Payments › Payroll Requests in the Finance
 * phone app (2026-10-16, part E4): the page's own gates (its tabs, the
 * treasury WITH Payroll payouts — what each department's payroll comes to),
 * every read its desktop page makes (`readPayrollRequests`); Treasury · Create
 * funds a round, Void or Approve sends a payroll back to HR (narrowed by the
 * page's tabs).
 */
export default async function FinAppPayrollRequests({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage('/payments/payroll-requests')
  const user = await requirePayrollPayouts('treasury')
  const sp = await searchParams
  const read = await readPayrollRequests(await createClient())
  const model = payrollRequestsModel({
    rows: read.rows,
    breakdown: Object.fromEntries(read.breakdownByRequest),
    funding: Object.fromEntries(read.fundingByRequest),
    statutory: read.statutoryPeriods,
  })
  return (
    <PayrollRequestsApp
      model={model}
      banks={read.banks}
      today={officeToday()}
      search={searchOf(sp)}
      can={{ fund: canDo(user, 'treasury', 'create'), sendBack: canDo(user, 'treasury', 'void') || canDo(user, 'treasury', 'approve') }}
    />
  )
}
