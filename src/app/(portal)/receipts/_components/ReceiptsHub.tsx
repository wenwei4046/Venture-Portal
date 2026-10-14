import { requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { HeadButton } from '@/components/finv/Hub'
import VoucherHub from '../../payments/_components/VoucherHub'
import { loadHubLedger, type LedgerParams } from '../../payments/_lib/hub-ledger'

// Receipt's hub (2026-10-14, the Finance revamp v2 — D09): Payments' hub read
// as receipts — the ledger's credit side, the cards All receipts … Received …
// Voided, the drawer a row opens (no full page: the README keeps a receipt's
// page as it is). *Create receipt* and *Loan repayment* open today's forms.

export default async function ReceiptsHub({ params }: { params: LedgerParams }) {
  const user = await requirePermission('treasury')
  const supabase = await createClient()
  const ledger = await loadHubLedger(supabase, user, 'credit', params)
  return (
    <VoucherHub
      ledger={ledger}
      canSetDefault={user.role === 'finance' || user.role === 'principal'}
      dept={[]}
      payroll={null}
      claims={[]}
      actions={
        canDo(user, 'treasury', 'create') ? (
          <>
            <HeadButton primary href="/payments/new?mode=receipt">
              Create receipt
            </HeadButton>
            <HeadButton href="/payments/new?mode=loan_repayment">Loan repayment</HeadButton>
          </>
        ) : null
      }
    />
  )
}
