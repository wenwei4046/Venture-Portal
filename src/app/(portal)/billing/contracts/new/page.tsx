import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import ContractForm from '../../_components/ContractForm'

export default async function NewContractPage() {
  await requireRole(['finance'])
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
      <div className="mt-6 mb-10">
        <h1 className="font-serif text-3xl text-ink">New Marketing Contract</h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          Create a project-based service contract. Requires{' '}
          <em>Principal approval</em> before invoices are generated.
        </p>
      </div>
      <ContractForm companies={companies ?? []} />
    </div>
  )
}
