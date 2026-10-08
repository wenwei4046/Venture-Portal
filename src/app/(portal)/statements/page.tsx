// /statements is now the Invoices landing (mig 2026-05-15 tab reorder).
// The Monthly Statements list moved to /statements/monthly.
//
// 2026-10-07: the export links moved into the page's action band
// (BillingView), beside the generating and the creating, so this is the view
// and nothing else.

import BillingView from '../billing/_components/BillingView'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default async function StatementsPage(props: Props) {
  return <BillingView searchParams={props.searchParams} />
}
