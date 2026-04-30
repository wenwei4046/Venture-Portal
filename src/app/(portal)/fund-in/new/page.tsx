import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Company } from '@/types'
import NewFundSourceForm from '../_components/NewFundSourceForm'

export default async function NewFundInPage() {
  await requireRole(['finance'])
  const supabase = await createClient()

  // Item 4: directors no longer needed — director_loan + outsource use free text.
  const [{ data: companyRows }, { data: deptRows }] = await Promise.all([
    supabase
      .from('companies')
      .select('*')
      .eq('is_active', true)
      .order('short_code'),
    supabase.from('departments').select('id, name').order('name'),
  ])

  const companies = (companyRows ?? []) as Company[]
  const departments = (deptRows ?? []) as { id: string; name: string }[]

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

      <NewFundSourceForm companies={companies} departments={departments} />
    </div>
  )
}
