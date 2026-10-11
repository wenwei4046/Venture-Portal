import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireActionOn, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import ContractForm from '../../../_components/ContractForm'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditContractPage({ params }: Props) {
  await requirePage('/billing/contracts/[id]/edit')
  await requireActionOn('/billing/contracts/[id]/edit', 'billing', 'edit')
  const supabase = await createClient()
  const { id } = await params

  const [{ data: contract }, { data: companies }] = await Promise.all([
    supabase
      .from('service_contracts')
      .select('*')
      .eq('id', id)
      .eq('billing_mode', 'marketing_project')
      .single(),
    supabase
      .from('companies')
      .select('id, name, short_code')
      .eq('is_active', true)
      .order('short_code'),
  ])

  if (!contract) notFound()

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
            <em>I.</em> BILLING · EDIT CONTRACT
          </div>
          <h1 className="page-title">Edit Contract</h1>
        </div>
      </div>
      <ContractForm
        companies={companies ?? []}
        contract={{
          id: contract.id,
          company_id: contract.company_id ?? '',
          description: contract.description ?? '',
          amount: contract.amount ? Number(contract.amount) : undefined,
          start_date: contract.start_date ?? '',
          end_date: contract.end_date ?? '',
        }}
      />
    </div>
  )
}
