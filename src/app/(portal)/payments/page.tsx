import { requirePage } from '@/lib/auth'
import PaymentsHub from './_components/PaymentsHub'
import type { LedgerParams } from './_lib/hub-ledger'

// Payment side: debit vouchers (HV-PV-*) only. Receipts (HV-OR-*) live on
// /receipts — split per user 2026-06-12. Since 2026-10-14 the Finance revamp
// v2's hub (D02–D05): the cards beside the list, the drawer a row opens.
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<LedgerParams>
}) {
  await requirePage('/payments')
  return <PaymentsHub params={await searchParams} />
}
