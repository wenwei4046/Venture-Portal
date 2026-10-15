import type { SupabaseClient } from '@supabase/supabase-js'
import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { listsPayrollByPerson } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import { fetchDailyBank } from '@/lib/daily-bank-data'
import { officeToday } from '@/lib/office-time'
import { dailyBankModel } from '@/lib/fin-app/daily-bank-model'
import DailyBankApp from '@/components/fin-app/DailyBankApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/page/daily-bank` — Daily › Daily Bank in the Finance phone app
 * (2026-10-15, part 5): the board's own page asked first (its tabs, the
 * treasury), the very day the desktop reads (`fetchDailyBank` — the office's
 * today unless `?date=` names another, never a later one; payroll by
 * department where the reader reads it so), the PDF for whoever may export.
 */
export default async function FinAppDailyBank({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePage('/daily-bank')
  const user = await requirePermission('treasury')
  const sp = await searchParams
  const search = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : []))).toString()
  const today = officeToday()
  const raw = typeof sp.date === 'string' ? sp.date : ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw <= today && !Number.isNaN(Date.parse(raw)) ? raw : today
  const supabase = (await createClient()) as unknown as SupabaseClient
  const data = await fetchDailyBank(supabase, date, { seesPayroll: listsPayrollByPerson(user) })
  return <DailyBankApp key={date} model={dailyBankModel(data, today)} search={search} today={today} canExport={canDo(user, 'treasury', 'export')} />
}
