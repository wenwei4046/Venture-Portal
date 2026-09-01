import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import ContractForm from '../../_components/ContractForm'

export default async function NewContractPage() {
  const user = await requirePermission('billing', 'my_billing')
  const supabase = await createClient()

  // Dept Manager restriction: must be Marketing's manager (it's the only
  // department that owns service_contracts today — mig 207 RLS enforces this
  // at the DB level too).
  if (user.role === 'dept_manager') {
    const { data: marketing } = await supabase
      .from('departments')
      .select('id')
      .eq('name', 'Marketing')
      .single()
    if (!marketing || user.department_id !== marketing.id) {
      notFound()
    }
  }

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, short_code')
    .eq('is_active', true)
    .order('short_code')

  const backHref = user.role === 'dept_manager' ? '/dept-pool/marketing' : '/billing'
  const backLabel = user.role === 'dept_manager' ? 'Back to Marketing Dept Pool' : 'Back to Billing'

  return (
    <div>
      <Link
        href={backHref}
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← {backLabel}
      </Link>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> BILLING · NEW MARKETING CONTRACT
          </div>
          <h1 className="page-title">New Marketing Contract</h1>
        </div>
      </div>
      <ContractForm companies={companies ?? []} returnPath={backHref} />
    </div>
  )
}
