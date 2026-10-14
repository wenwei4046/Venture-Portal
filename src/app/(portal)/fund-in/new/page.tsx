import Link from 'next/link'
import { requireActionOn, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import NewFundSourceForm from '../_components/NewFundSourceForm'
import { loadNewSourceOptions } from '../_lib/new-source-options'

export default async function NewFundInPage() {
  await requirePage('/fund-in/new')
  await requireActionOn('/fund-in/new', 'treasury', 'create')
  const supabase = await createClient()

  // The same lists the hub's Record fund in reads (2026-10-15, `_lib/new-source-options`).
  // Item 4: directors no longer needed — director_loan + outsource use free text.
  const { companies, departments, accounts, banks } = await loadNewSourceOptions(supabase)

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

      <NewFundSourceForm companies={companies} departments={departments} liabilityAccounts={accounts} banks={banks} />
    </div>
  )
}
