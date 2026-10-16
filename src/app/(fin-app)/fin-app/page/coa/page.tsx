import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { readAccountRows } from '@/app/(portal)/settings/_lib/accounts-read'
import { searchOf, type SearchParams } from '@/lib/fin-app/report-page'
import CoaApp from '@/components/fin-app/CoaApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/page/coa` — Report › Chart of Account in the Finance phone app
 * (2026-10-15, part E3b): Settings › Chart of Accounts' own gates (its tabs,
 * `categories`), every account as the Settings page reads it
 * (`readAccountRows`); Settings · Manage (`categories.manage`, narrowed by the
 * page's tabs) adds and edits.
 */
export default async function FinAppChartOfAccounts({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage('/settings')
  const user = await requirePermission('categories')
  const sp = await searchParams
  const accounts = await readAccountRows(await createClient())
  return <CoaApp accounts={accounts} search={searchOf(sp)} canManage={canDo(user, 'categories', 'manage')} />
}
