// Phase 7 Step 11: "Invoices" sub-tab of Statements (formerly /billing).
// /billing now redirects here to keep old links functional.

import BillingView from '../../billing/_components/BillingView'
import StatementsTabHeader from '../_components/StatementsTabHeader'

interface Props {
  searchParams: Promise<{ period?: string }>
}

export default function StatementsInvoicesPage(props: Props) {
  return (
    <div>
      <StatementsTabHeader active="invoices" />
      <BillingView {...props} />
    </div>
  )
}
