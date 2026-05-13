import Link from 'next/link'
import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Company } from '@/types'
import { bsCategoriesForDisbursement } from '@/lib/loan-disbursement'
import NewLoanForm from '../_components/NewLoanForm'

export default async function NewLoanPage() {
  await requireRole(['finance'])
  const supabase = await createClient()

  const [
    { data: companyRows },
    { data: baseRateRow },
    { data: catRows },
  ] = await Promise.all([
    supabase.from('companies').select('*').eq('is_active', true).order('short_code'),
    supabase
      .from('base_rate_history')
      .select('base_rate, quarter, effective_from')
      .not('approved_at', 'is', null)
      .lte('effective_from', dayjs().format('YYYY-MM-DD'))
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('payment_categories')
      .select('code, label, account_type, is_active')
      .eq('is_active', true)
      .order('label'),
  ])

  const companies = (companyRows ?? []) as Company[]
  const bsCategories = bsCategoriesForDisbursement(
    (catRows ?? []).map((r) => ({
      code: r.code as string,
      label: r.label as string,
      account_type: (r.account_type as string | null) ?? '',
      is_active: r.is_active as boolean,
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
        <NewLoanForm companies={companies} baseRate={baseRate} bsCategories={bsCategories} />
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
