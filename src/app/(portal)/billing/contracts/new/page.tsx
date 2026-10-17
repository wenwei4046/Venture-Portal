import Link from 'next/link'
import { requireActionOn, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import ContractForm from '../../_components/ContractForm'

// Billing · Create's (Finance, the Principal). The Marketing department's own manager made theirs here through
// My Billing until the Dept Manager went (2026-10-17).
export default async function NewContractPage() {
  await requirePage('/billing/contracts/new')
  await requireActionOn('/billing/contracts/new', 'billing', 'create')
  const supabase = await createClient()

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, short_code')
    .eq('is_active', true)
    .order('short_code')

  return (
    <div>
      <Link
        href="/billing"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Billing
      </Link>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> BILLING · NEW MARKETING CONTRACT
          </div>
          <h1 className="page-title">New Marketing Contract</h1>
        </div>
      </div>
      <ContractForm companies={companies ?? []} returnPath="/billing" />
    </div>
  )
}
