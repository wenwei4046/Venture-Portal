import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import TeamTabs from '../_components/TeamTabs'
import TitlesSection, { type TitleRow, type DepartmentOption } from './_components/TitlesSection'

/**
 * Role & Permission.
 *
 * Half of it for now: what titles exist and which department each sits under.
 * The permission matrix that hangs off a title is the next phase — it replaces
 * the four hard-coded roles, so it lands with the RLS rewrite rather than
 * ahead of it.
 */
export default async function RolesPage() {
  const user = await requireRole(['principal', 'hr'])
  const supabase = await createClient()

  const [{ data: titles }, { data: departments }, { data: holders }] = await Promise.all([
    supabase
      .from('titles')
      .select('id, name, department_id, is_active, departments (name)')
      .order('name'),
    supabase.from('departments').select('id, name').order('name'),
    supabase
      .from('hr_staff_costs')
      .select('title_id')
      .eq('status', 'active')
      .not('title_id', 'is', null),
  ])

  const headcount = new Map<string, number>()
  for (const h of holders ?? []) {
    const key = (h as { title_id: string }).title_id
    headcount.set(key, (headcount.get(key) ?? 0) + 1)
  }

  const rows: TitleRow[] = (titles ?? []).map(t => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const r = t as any
    return {
      id: r.id,
      name: r.name,
      departmentId: r.department_id ?? null,
      departmentName: r.departments?.name ?? null,
      isActive: r.is_active,
      people: headcount.get(r.id) ?? 0,
    }
  })

  const deptOptions: DepartmentOption[] = (departments ?? []).map(d => ({
    id: d.id,
    name: d.name,
  }))

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> TEAM · ROLE &amp; PERMISSION
          </div>
          <h1 className="page-title">Roles</h1>
          <p className="font-serif italic text-graphite text-base mt-3 max-w-2xl">
            A title says what somebody is called and which department that role
            belongs under. What each title is allowed to do lands here next.
          </p>
        </div>
      </div>

      <TeamTabs active="roles" />

      <TitlesSection
        titles={rows}
        departments={deptOptions}
        canDelete={user.role === 'principal'}
      />
    </div>
  )
}
