import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { readDeptRequests } from '@/app/(portal)/payments/dept-requests/_lib/dept-read'
import { deptRequestsModel } from '@/lib/fin-app/requests-model'
import { searchOf, type SearchParams } from '@/lib/fin-app/report-page'
import RequestsApp from '@/components/fin-app/RequestsApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/page/dept-requests` — Payments › Dept Payment Requests in the
 * Finance phone app (2026-10-16, part E4): the page's own gates (its tabs, the
 * treasury), the requests its desktop page reads (`readDeptRequests`);
 * Treasury · Create generates the voucher, Treasury · Void cancels a request
 * (both narrowed by the page's tabs).
 */
export default async function FinAppDeptRequests({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage('/payments/dept-requests')
  const user = await requirePermission('treasury')
  const sp = await searchParams
  const { rows, banks } = await readDeptRequests(await createClient())
  return (
    <RequestsApp
      kind="dept"
      model={deptRequestsModel(rows)}
      banks={banks}
      search={searchOf(sp)}
      can={{ raise: canDo(user, 'treasury', 'create'), cancel: canDo(user, 'treasury', 'void') }}
    />
  )
}
