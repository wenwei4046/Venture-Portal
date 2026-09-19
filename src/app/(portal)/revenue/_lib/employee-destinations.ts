import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { titlesForDepartment } from '@/lib/staff-form'
import { listSubDepartments } from './sub-departments'

export interface EmployeeDepartmentDestination {
  id: string
  name: string
  titles: Array<{ id: string; name: string }>
}

interface DepartmentTitle {
  id: string
  name: string
  department_id: string | null
}

async function allRows<T>(query: {
  range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>
}): Promise<T[]> {
  const pageSize = 1000
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) throw new Error('Could not load departments and titles for employee transfers.')
    const page = (data ?? []) as T[]
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

/**
 * People-management destinations visible to the signed-in account. Departments
 * have no active/status flag; existing rows are the same choices People uses.
 * Titles must be active, non-head, and either global or owned by the target.
 * A commission destination also needs a rung on its home scheme, so moving
 * the company roster can create the person's home membership automatically.
 * The page only requests this catalog for accounts with the team permission;
 * every employment write checks that permission and these facts again.
 */
export async function loadEmployeeDepartmentDestinations(): Promise<EmployeeDepartmentDestination[]> {
  const supabase = (await createClient()) as unknown as SupabaseClient
  const [departments, titles, subDepartments] = await Promise.all([
    allRows<{ id: string; name: string; payroll_source: string }>(supabase.from('departments')
      .select('id, name, payroll_source').order('name').order('id')),
    allRows<DepartmentTitle>(supabase.from('titles')
      .select('id, name, department_id').eq('is_active', true).eq('is_department_head', false)
      .order('name').order('id')),
    listSubDepartments(),
  ])
  const homeByDepartment = new Map(subDepartments.filter(sub => sub.isHome && sub.schemeId)
    .map(sub => [sub.departmentId, sub.schemeId!]))
  const schemeIds = [...new Set(departments.filter(department => department.payroll_source === 'commission')
    .flatMap(department => homeByDepartment.get(department.id) ?? []))]
  const rungs = schemeIds.length ? await allRows<{ scheme_id: string; title_id: string }>(supabase.from('comm_ranks')
    .select('scheme_id, title_id').in('scheme_id', schemeIds).order('id')) : []
  const titlesOnHome = new Set(rungs.map(rung => `${rung.scheme_id}:${rung.title_id}`))
  return departments.map(department => ({
    id: department.id,
    name: department.name,
    titles: titlesForDepartment(titles, department.id)
      .filter(title => department.payroll_source !== 'commission'
        || titlesOnHome.has(`${homeByDepartment.get(department.id)}:${title.id}`))
      .map(title => ({ id: title.id, name: title.name })),
  }))
}
