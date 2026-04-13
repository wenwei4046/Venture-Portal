import Link from 'next/link'
import dayjs from 'dayjs'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Company } from '@/types'
import NewLoanForm from '../_components/NewLoanForm'

export default async function NewLoanPage() {
  await requireRole(['finance'])
  const supabase = await createClient()

  const [
    { data: companyRows },
    { data: baseRateRow },
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
  ])

  const companies = (companyRows ?? []) as Company[]

  const baseRate = baseRateRow
    ? {
        rate: Number(baseRateRow.base_rate),
        quarter: baseRateRow.quarter,
      }
    : null

  return (
    <div>
      <div className="mb-10">
        <Link
          href="/fund-out"
          className="text-sm text-muted hover:text-accent font-sans transition-colors"
        >
          ← Back to Fund OUT
        </Link>
        <h1 className="font-serif text-3xl text-ink mt-3">New loan</h1>
        <p className="font-serif italic text-graphite text-base mt-2">
          Submit a new loan for <em>Principal approval</em>. Rate locks at
          submission using the active base rate + your custom interest rate.
        </p>
      </div>

      {baseRate ? (
        <NewLoanForm companies={companies} baseRate={baseRate} />
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
