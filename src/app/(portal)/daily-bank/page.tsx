// Daily Bank dashboard (user 2026-08-11, modelled on their other system's
// board): per bank per day — Balance B/F → received today → pending
// (submitted, awaiting Principal) → Available, split across department
// columns. Two views: BANK × DEPARTMENT matrix and a simpler by-bank list.
// Any date is viewable; balances are GL-exact, historical pending is
// reconstructed from submit/approve timestamps (≈).

import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/auth'
import { canSeePayrollPayouts } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import { fetchDailyBank } from '@/lib/daily-bank-data'
import DailyBankView from './_components/DailyBankView'

export const dynamic = 'force-dynamic'

export default async function DailyBankPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const user = await requirePermission('treasury')
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { date: rawDate } = await searchParams

  const today = dayjs().format('YYYY-MM-DD')
  const date =
    rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && dayjs(rawDate).isValid() ? rawDate : today

  const data = await fetchDailyBank(supabase, date, { seesPayroll: canSeePayrollPayouts(user) })

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TREASURY · DAILY BANK
          </div>
          <h1 className="page-title">Daily Bank</h1>
          <p className="font-serif italic text-graphite text-base mt-2">
            Where the cash stands today: balance b/f, money in, pending payments awaiting the
            Principal, and what is truly free — per bank, split by department.
          </p>
        </div>
      </div>

      <DailyBankView data={data} today={today} />
    </div>
  )
}
