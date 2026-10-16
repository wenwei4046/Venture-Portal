import { requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { officeMonth, officeToday } from '@/lib/office-time'
import { loadHubLedger, type LedgerParams } from '../../payments/_lib/hub-ledger'
import ReceiptsHubClient from './ReceiptsHubClient'

// Receipt's hub (2026-10-14, the Finance revamp v2 — D09): Payments' hub read
// as receipts — the ledger's credit side, the cards All receipts … Received …
// Voided, the drawer a row opens (no full page: the README keeps a receipt's
// page as it is). *Create receipt* and *Loan repayment* open their dialogs.

export default async function ReceiptsHub({ params }: { params: LedgerParams }) {
  const user = await requirePermission('treasury')
  const supabase = await createClient()
  const ledger = await loadHubLedger(supabase, user, 'credit', params)
  return (
    <ReceiptsHubClient
      ledger={ledger}
      canCreate={canDo(user, 'treasury', 'create')}
      canSetDefault={user.role === 'finance' || user.role === 'principal'}
      canExport={canDo(user, 'treasury', 'export')}
      prefix={`HV-OR-${officeMonth().replace('-', '')}`}
      today={officeToday()}
    />
  )
}
