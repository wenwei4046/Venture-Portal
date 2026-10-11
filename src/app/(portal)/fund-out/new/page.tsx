import Link from 'next/link'
import { officeToday } from '@/lib/office-time'
import { requireActionOn, requirePage } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Company } from '@/types'
import { bsAccountsForDisbursement } from '@/lib/loan-disbursement'
import NewLoanForm from '../_components/NewLoanForm'

export default async function NewLoanPage() {
  await requirePage('/fund-out/new')
  await requireActionOn('/fund-out/new', 'treasury', 'create')
  const supabase = await createClient()

  const [
    { data: companyRows },
    { data: baseRateRow },
    { data: acctRows },
    { data: bankRows },
  ] = await Promise.all([
    supabase.from('companies').select('*').eq('is_active', true).order('short_code'),
    supabase
      .from('base_rate_history')
      .select('base_rate, quarter, effective_from')
      .not('approved_at', 'is', null)
      .lte('effective_from', officeToday())
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('chart_of_accounts')
      .select('code, name, type, parent_code, is_active')
      .eq('is_active', true)
      .order('type')
      .order('code'),
    supabase
      .from('bank_accounts')
      .select('id, bank_name, account_number, current_balance, is_primary')
      .eq('status', 'active')
      .order('is_primary', { ascending: false }),
  ])

  const companies = (companyRows ?? []) as Company[]
  const bsAccounts = bsAccountsForDisbursement(
    (acctRows ?? []).map((r) => ({
      code: r.code,
      name: r.name,
      account_type: r.type as string,
      parent_code: (r as { parent_code: string | null }).parent_code ?? null,
      is_active: r.is_active,
    })),
  )

  const baseRate = baseRateRow
    ? {
        rate: Number(baseRateRow.base_rate),
        quarter: baseRateRow.quarter,
      }
    : null

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
        <NewLoanForm
          companies={companies}
          baseRate={baseRate}
          bsAccounts={bsAccounts}
          banks={(bankRows ?? []).map((b) => ({
            id: b.id,
            bank_name: b.bank_name,
            account_number: b.account_number,
            current_balance: Number(b.current_balance ?? 0),
            is_primary: !!b.is_primary,
          }))}
        />
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
