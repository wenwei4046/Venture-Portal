// /statements is the Invoices landing (mig 2026-05-15 tab reorder).
// The Monthly Statements list moved to /statements/monthly.
//
// 2026-10-14 — the Finance revamp v2 (D10): Invoice's hub, the design's page
// for every reader of it (InvoicesHub), in place of Service Billing's sheet.

import { requirePage } from '@/lib/auth'
import InvoicesHub from './_components/InvoicesHub'

interface Props {
  searchParams: Promise<{ period?: string; status?: string; new?: string }>
}

export default async function StatementsPage(props: Props) {
  await requirePage('/statements')
  return <InvoicesHub searchParams={props.searchParams} />
}
