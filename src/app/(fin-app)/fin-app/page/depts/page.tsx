import { requirePage, requirePermission } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { createClient } from '@/lib/supabase/server'
import { loadDepartmentModes } from '@/lib/department-mode-server'
import { readDepartmentRows } from '@/app/(portal)/settings/_lib/departments-read'
import { departmentsModel } from '@/lib/fin-app/departments-model'
import { searchOf, type SearchParams } from '@/lib/fin-app/report-page'
import DepartmentsApp from '@/components/fin-app/DepartmentsApp'

export const dynamic = 'force-dynamic'

/**
 * `/fin-app/page/depts` — Profile › Admin › Departments in the Finance phone
 * app (2026-10-15, part E3b): Settings › Departments' own gates (its tabs,
 * Chart of accounts — `categories`; the tab every reader of Settings opens),
 * the registry's rows as the Settings page reads them (`readDepartmentRows`),
 * the pools' names and each department's mode (`loadDepartmentModes`, which
 * also says whether the person signed in may switch it). Settings · Manage
 * (`categories.manage`, narrowed by the page's tabs) adds, provisions and
 * sets the bill-back.
 */
export default async function FinAppDepartments({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePage('/settings')
  const user = await requirePermission('categories')
  const sp = await searchParams
  const supabase = await createClient()
  const [rows, modes] = await Promise.all([readDepartmentRows(supabase), loadDepartmentModes().catch(() => [])])
  const poolCodes = [...new Set(rows.map((d) => d.pool_gl_code).filter((c): c is string => !!c))]
  const { data: pools } = poolCodes.length
    ? await supabase.from('chart_of_accounts').select('code, name').in('code', poolCodes)
    : { data: [] as Array<{ code: string; name: string }> }
  const poolNames = Object.fromEntries((pools ?? []).map((a) => [a.code as string, a.name as string]))
  return <DepartmentsApp model={departmentsModel(rows, modes, poolNames)} search={searchOf(sp)} canManage={canDo(user, 'categories', 'manage')} />
}
