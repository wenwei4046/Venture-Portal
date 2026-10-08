import Link from 'next/link'
import { requireAnyAction } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import ContractForm from '../../../billing/_components/ContractForm'

export default async function NewContractFromDeptPool() {
  const user = await requireAnyAction(['billing', 'create'], ['my_billing', 'create', 'dept'])
  const supabase = await createClient()

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, short_code')
    .eq('is_active', true)
    .order('short_code')

  return (
    <div>
      <Link
        href="/dept-pool"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Dept Pool
      </Link>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> DEPARTMENTS · NEW PROJECT CONTRACT
          </div>
          <h1 className="page-title">New Project Contract</h1>
        </div>
      </div>
      <ContractForm companies={companies ?? []} returnPath="/dept-pool" />
    </div>
  )
}
