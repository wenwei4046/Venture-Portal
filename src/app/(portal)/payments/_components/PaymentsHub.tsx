import { requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { loadPaymentsHub } from '../_lib/payments-hub'
import type { LedgerParams } from '../_lib/hub-ledger'
import PaymentsHubClient from './PaymentsHubClient'

// Payments (2026-10-14, the Finance revamp v2 — D02–D05): the ledger read
// once, and what waits for a voucher — Dept Requests, Payroll Requests (the
// Payroll payouts right's, as its page), Claim Requests — each a menu in the
// head. The reads are `loadPaymentsHub` (the Finance phone app's too).

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
      dept={hub.dept}
      payroll={hub.payroll}
      claims={hub.claims}
    />
  )
}
