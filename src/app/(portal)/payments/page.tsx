import VoucherLedger, { type LedgerSearchParams } from './_components/VoucherLedger'

// Payment side: debit vouchers (HV-PV-*) only. Receipts (HV-OR-*) live on
// /receipts — split per user 2026-06-12.
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<LedgerSearchParams>
}) {
  return <VoucherLedger direction="debit" params={await searchParams} />
}
