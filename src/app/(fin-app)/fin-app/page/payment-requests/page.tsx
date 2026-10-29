import { requirePage, requirePermission } from '@/lib/auth'
import { searchOf, type SearchParams } from '@/lib/fin-app/report-page'
import { readPaymentRequests } from '@/app/(portal)/payments/requests/_lib/requests-read'
import PaymentRequestsApp from '@/components/fin-app/PaymentRequestsApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/page/payment-requests` — Payments › Payment request in the Finance phone app (2026-10-29, PR ⑥ of
 * docs/module-spec-payment-requests.md): the sidebar row's own screen, behind Payment's *Requests · N*. The desktop
 * page's gates (its tabs, the treasury) and its read (`readPaymentRequests` — payroll and statutory for Payroll payouts
 * holders only); the old Claim, Dept and Payroll request screens redirect here.
 */
export default async function FinAppPaymentRequests({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage('/payments/requests')
  const user = await requirePermission('treasury')
  const sp = await searchParams
  return <PaymentRequestsApp data={await readPaymentRequests(user)} search={searchOf(sp)} />
}
