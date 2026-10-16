// Daily Bank dashboard (user 2026-08-11, modelled on their other system's
// board): per bank per day — Balance B/F → received today → pending
// (submitted, awaiting Principal) → Available, split across department
// columns. Two views: BANK × DEPARTMENT matrix and a simpler by-bank list.
// Any date is viewable; balances are GL-exact, historical pending is
// reconstructed from submit/approve timestamps (≈).
//
// 2026-10-09 (the Finance revamp): the head — the day between its arrows,
// PNG / PDF / Get image — belongs to DailyBankView, which holds the board the
// image is taken of.

import dayjs from 'dayjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePermission, requirePage } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { listsPayrollByPerson } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import { fetchDailyBank } from '@/lib/daily-bank-data'
import { officeToday } from '@/lib/office-time'
import DailyBankView from './_components/DailyBankView'

export const dynamic = 'force-dynamic'

export default async function DailyBankPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  await requirePage('/daily-bank')
  const user = await requirePermission('treasury')
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { date: rawDate } = await searchParams

  // The office's today, not the server's: on Vercel (UTC) the board opened on
  // yesterday until 08:00.
  const today = officeToday()
  const date =
    rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) && dayjs(rawDate).isValid() ? rawDate : today

  const data = await fetchDailyBank(supabase, date, { seesPayroll: listsPayrollByPerson(user) })

  // The PDF only for whoever may take it out — the route asks Treasury · Export (2026-10-16).
  return <DailyBankView data={data} today={today} canExport={canDo(user, 'treasury', 'export')} />
}
