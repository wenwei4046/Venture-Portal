import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Company } from '@/types'
import type { AccountType } from '@/lib/coa'
import NewFundSourceForm from '../_components/NewFundSourceForm'
import type { AccountOption } from '@/components/AccountPicker'

export default async function NewFundInPage() {
  await requireRole(['finance', 'principal'])
  const supabase = await createClient()

  // Item 4: directors no longer needed — director_loan + outsource use free text.
  const [{ data: companyRows }, { data: deptRows }, { data: acctRows }] = await Promise.all([
    supabase
      .from('companies')
      .select('*')
      .eq('is_active', true)
      .order('short_code'),
    // is_internal=false — the 'Venture Office' pseudo-dept is not a fund source.
    supabase.from('departments').select('id, name').eq('is_internal', false).order('name'),
    supabase
      .from('chart_of_accounts')
      .select('code, name, type, parent_code, is_active')
      .eq('is_active', true)
      .in('type', ['liability', 'equity'])
      .order('code'),
  ])

  const companies = (companyRows ?? []) as Company[]
  const departments = (deptRows ?? []) as { id: string; name: string }[]
  const liabilityAccounts: AccountOption[] = (acctRows ?? []).map((a) => ({
    code: a.code as string,
    name: a.name as string,
    type: a.type as AccountType,
    parent_code: (a as { parent_code: string | null }).parent_code ?? null,
    is_active: a.is_active as boolean,
  }))

  return (
    <div>
      <Link
        href="/fund-in"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Fund IN
      </Link>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · NEW FUND SOURCE
          </div>
          <h1 className="page-title">New fund source</h1>
        </div>
      </div>

      <NewFundSourceForm
        companies={companies}
        departments={departments}
        liabilityAccounts={liabilityAccounts}
      />
    </div>
  )
}
