import VoucherLedger, { type LedgerSearchParams } from '../payments/_components/VoucherLedger'

// Receipt side: credit vouchers (HV-OR-*) only — same tabs/filters/table as
// /payments. Split per user 2026-06-12.
export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<LedgerSearchParams>
}) {
  return <VoucherLedger direction="credit" params={await searchParams} />
}
