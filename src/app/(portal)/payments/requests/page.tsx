import { requirePage, requirePermission } from '@/lib/auth'
import RequestsHub from './_components/RequestsHub'
import { readPaymentRequests } from './_lib/requests-read'

// Payments › Payment request (2026-10-29, PR ① of docs/module-spec-payment-requests.md — the claim process the user
// settled with the boss): what is sent to Finance to pay, in Payment voucher's hub — HR's payroll funding requests and
// the members' claims HR approved for payment, a card each for Payroll and every department, a row's drawer and its
// right-click menu to work it.
export default async function PaymentRequestsPage() {
  await requirePage('/payments/requests')
  const user = await requirePermission('treasury')
  return <RequestsHub data={await readPaymentRequests(user)} />
}
