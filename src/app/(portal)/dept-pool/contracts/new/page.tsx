import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import ContractForm from '../../../billing/_components/ContractForm'

export default async function NewContractFromDeptPool() {
  const user = await requireRole(['dept_manager', 'finance'])
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
      <div className="mt-6 mb-10">
        <h1 className="font-serif text-3xl text-ink">New Project Contract</h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          Create a project-based service contract for your department.
          Requires <em>Principal approval</em> before billing.
        </p>
      </div>
      <ContractForm companies={companies ?? []} returnPath="/dept-pool" />
    </div>
  )
}
