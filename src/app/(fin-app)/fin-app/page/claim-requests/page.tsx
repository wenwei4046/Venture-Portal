import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { readClaimRequests } from '@/app/(portal)/payments/claim-requests/_lib/claim-read'
import { claimRequestsModel } from '@/lib/fin-app/requests-model'
import { searchOf, type SearchParams } from '@/lib/fin-app/report-page'
import RequestsApp from '@/components/fin-app/RequestsApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/page/claim-requests` — Payments › Claim requests in the Finance
 * phone app (2026-10-16, part E4): the page's own gates (its tabs, the
 * treasury), the queue its desktop page reads (`readClaimRequests`); Treasury
 * · Create (narrowed by the page's tabs) raises a voucher.
 */
export default async function FinAppClaimRequests({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage('/payments/claim-requests')
  const user = await requirePermission('treasury')
  const sp = await searchParams
  const { rows, banks } = await readClaimRequests(await createClient())
  return <RequestsApp kind="claim" model={claimRequestsModel(rows)} banks={banks} search={searchOf(sp)} can={{ raise: canDo(user, 'treasury', 'create'), cancel: false }} />
}
