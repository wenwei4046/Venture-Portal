import Link from 'next/link'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { canManagePermissions } from '@/lib/roles'
import TitlesSection, { type TitleRow, type DepartmentOption } from './_components/TitlesSection'

/**
 * Roles.
 *
 * What a title IS: which titles exist and which department each belongs
 * under. What a title may DO is the Permissions page next door; the two
 * shared a page as "Role & Permission" until the user asked for them apart
 * (2026-09-03). How high a title stands — the ladder — was set here too,
 * until 2026-09-05, when the user moved the Levels board to Hierarchy, next
 * to the chart that obeys it.
 */
export default async function RolesPage() {
  const user = await requirePermission('team')
  const supabase = await createClient()

  const [{ data: titles }, { data: departments }, { data: staff }] = await Promise.all([
    supabase
      .from('titles')
      .select('id, name, department_id, is_active, is_department_head, departments (name)')
      .order('name'),
    supabase.from('departments').select('id, name').order('name'),
    // Active people: the headcount per title.
    supabase.from('hr_staff_costs').select('id, title_id').eq('status', 'active'),
  ])

  const headcount = new Map<string, number>()
  for (const p of (staff ?? []) as Array<{ id: string; title_id: string | null }>) {
    if (!p.title_id) continue
    headcount.set(p.title_id, (headcount.get(p.title_id) ?? 0) + 1)
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
      isDepartmentHead: r.is_department_head === true,
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
            <em>I.</em> PEOPLE · ROLES
          </div>
          <h1 className="page-title">Roles</h1>
          {/* On the sheet a link in running text is black and underlined —
              orange is never lettering (DESIGN.md › "Sheet theme"). */}
          <p className="text-sm mt-3 max-w-2xl">
            A title says what somebody is called and which department that role
            belongs under. How high it stands is the ladder, under{' '}
            <Link
              href="/team/hierarchy?tab=levels"
              className="underline underline-offset-[3px] decoration-ink/35 hover:decoration-ink"
            >
              Hierarchy → Levels
            </Link>
            ; what it is allowed to do is on{' '}
            <Link
              href="/team/permissions"
              className="underline underline-offset-[3px] decoration-ink/35 hover:decoration-ink"
            >
              Permissions
            </Link>
            .
          </p>
        </div>
      </div>

      <TitlesSection
        titles={rows}
        departments={deptOptions}
        canDelete={canManagePermissions(user)}
      />
    </div>
  )
}
