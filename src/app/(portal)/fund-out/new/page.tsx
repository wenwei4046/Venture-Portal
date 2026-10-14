import Link from 'next/link'
import { requireActionOn, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import NewLoanForm from '../_components/NewLoanForm'
import { loadNewLoanOptions } from '../_lib/new-loan-options'

export default async function NewLoanPage() {
  await requirePage('/fund-out/new')
  await requireActionOn('/fund-out/new', 'treasury', 'create')
  const supabase = await createClient()

  // The same lists the hub's Create fund out reads (2026-10-15, `_lib/new-loan-options`).
  const { companies, baseRate, bsAccounts, banks } = await loadNewLoanOptions(supabase)

  return (
    <div>
      <Link
        href="/fund-out"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Fund OUT
      </Link>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · NEW LOAN
          </div>
          <h1 className="page-title">New loan</h1>
        </div>
      </div>

      {baseRate ? (
        <NewLoanForm companies={companies} baseRate={baseRate} bsAccounts={bsAccounts} banks={banks} />
      ) : (
        <div className="bg-alert-bg border border-alert rounded-md p-6 max-w-3xl">
          <p className="font-serif text-lg text-alert mb-1">
            No approved base rate.
          </p>
          <p className="font-sans text-sm text-graphite">
            Principal must approve a quarterly base rate before loans can be
            submitted. See{' '}
            <Link href="/settings" className="text-accent hover:underline">
              Settings
            </Link>{' '}
            or the Base Rate Calculator (Phase 1.5).
          </p>
        </div>
      )}
    </div>
  )
}
