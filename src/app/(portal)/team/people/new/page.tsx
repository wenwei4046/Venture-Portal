import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import type { ManagerOption, SubDepartmentOption, TitleOption } from '@/lib/staff-form'
import { listSubDepartments } from '../../../revenue/_lib/sub-departments'
import AddStaffForm, { type AddStaffDepartment } from '../_components/AddStaffForm'

export default async function NewStaffPage() {
  await requirePermission('team')
  const supabase = await createClient()

  // is_internal=false excludes the hidden 'Venture Office' pseudo-department —
  // staff can't be assigned to it. payroll_source says which department the
  // commission engine pays, and so which one offers "Full commission";
  // segment_key 'director' is the one the Director Salary engine pays, and so
  // the one that offers "Variable pay".
  // Titles are rows since 2026-09-01; only the active ones are on offer.
  const [{ data: departments }, { data: titles }, subDepartments, { data: roster }, { data: rungs }, nextCode] = await Promise.all([
    supabase
      .from('departments')
      .select('id, name, payroll_source, segment_key')
      .eq('is_internal', false)
      .order('name'),
    supabase
      .from('titles')
      .select('id, name, department_id')
      .eq('is_active', true)
      .order('name'),
    // A department may be divided (Revenue: Fair, IR). Which one somebody is
    // BASED in is their own fact since 2026-09-20 and is chosen here, at the
    // one moment the whole record is being written.
    listSubDepartments(),
    // Who they report to. Inside a commission department that line is also the
    // commission upline, so the form keeps it inside the department; the
    // database refuses the rest (23BND, 23REC, 23LAD).
    supabase
      .from('hr_staff_costs')
      .select('id, employee_name, employee_code, department_id, departments (name)')
      .eq('status', 'active')
      .order('employee_name'),
    // A base carries the company title, so it needs a rung on that ladder.
    (supabase as unknown as SupabaseClient)
      .from('comm_ranks')
      .select('scheme_id, title_id')
      .then(r => r, () => ({ data: [] as Array<{ scheme_id: string; title_id: string }> })),
    // The code the person will get — HV + the largest number on the roster
    // + 1, handed out by the database when the row is saved (trigger
    // `hr_staff_costs_assign_code`, 2026-09-12). Asked here only so the form
    // can say it; the answer is a preview, not a reservation. The function
    // postdates database.types.ts, hence the untyped client, and a refusal
    // costs the preview and nothing else.
    (supabase as unknown as SupabaseClient)
      .rpc('next_staff_code')
      .then(
        r => (typeof r.data === 'string' ? r.data : null),
        () => null,
      ),
  ])

  const titlesByScheme = new Map<string, string[]>()
  for (const rung of (rungs ?? []) as Array<{ scheme_id: string; title_id: string }>) {
    titlesByScheme.set(rung.scheme_id, [...(titlesByScheme.get(rung.scheme_id) ?? []), rung.title_id])
  }
  const subDepartmentOptions: SubDepartmentOption[] = subDepartments
    .filter(sub => sub.schemeId)
    .map(sub => ({
      id: sub.id,
      name: sub.name,
      departmentId: sub.departmentId,
      isHome: sub.isHome,
      titleIds: [...new Set(titlesByScheme.get(sub.schemeId!) ?? [])],
    }))
  const managers: ManagerOption[] = ((roster ?? []) as Array<{
    id: string; employee_name: string; employee_code: string | null; department_id: string | null
    departments: { name: string } | Array<{ name: string }> | null
  }>).map(person => ({
    id: person.id,
    name: person.employee_name,
    code: person.employee_code,
    departmentId: person.department_id,
    departmentName: (Array.isArray(person.departments) ? person.departments[0] : person.departments)?.name ?? null,
  }))

  return (
    <div>
      <Link
        href="/team/people"
        className="text-sm text-muted hover:text-accent font-sans transition-colors"
      >
        ← Back to Staff
      </Link>

      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> PEOPLE · NEW PERSON
          </div>
          <h1 className="page-title">Add Staff</h1>
        </div>
      </div>

      <AddStaffForm
        departments={(departments ?? []) as AddStaffDepartment[]}
        titles={(titles ?? []) as TitleOption[]}
        subDepartments={subDepartmentOptions}
        managers={managers}
        nextCode={nextCode}
      />
    </div>
  )
}
