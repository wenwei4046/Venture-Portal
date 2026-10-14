import { requirePage } from '@/lib/auth'
import ReceiptsHub from './_components/ReceiptsHub'
import type { LedgerParams } from '../payments/_lib/hub-ledger'

// Receipt side: credit vouchers (HV-OR-*) only — split from /payments per user
// 2026-06-12. Since 2026-10-14 the Finance revamp v2's hub (D09): the cards
// beside the list, the drawer a row opens — Payments' parts, read as receipts.
export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<LedgerParams>
}) {
  await requirePage('/receipts')
  return <ReceiptsHub params={await searchParams} />
}
