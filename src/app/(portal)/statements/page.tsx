// /statements is now the Invoices landing (mig 2026-05-15 tab reorder).
// The Monthly Statements list moved to /statements/monthly.

import BillingView from '../billing/_components/BillingView'
import StatementsTabHeader from './_components/StatementsTabHeader'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default function StatementsPage(props: Props) {
  return (
    <div>
      <StatementsTabHeader active="invoices" />
      <BillingView {...props} />
    </div>
  )
}
