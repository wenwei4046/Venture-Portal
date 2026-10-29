import { requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { loadPaymentsHub } from '../_lib/payments-hub'
import type { LedgerParams } from '../_lib/hub-ledger'
import PaymentsHubClient from './PaymentsHubClient'

// Payments › Payment voucher (2026-10-14, the Finance revamp v2 — D02–D05): the ledger read once (`loadPaymentsHub`,
// the Finance phone app's too). What waits for a voucher is Payments › Payment request's since 2026-10-29.

export default async function PaymentsHub({ params }: { params: LedgerParams }) {
  const user = await requirePermission('treasury')
  const hub = await loadPaymentsHub(user, params)
  return (
    <PaymentsHubClient
      ledger={hub.ledger}
      canCreate={hub.canCreate}
      create={hub.create}
      canSetDefault={hub.canSetDefault}
      canExport={canDo(user, 'treasury', 'export')}
    />
  )
}
