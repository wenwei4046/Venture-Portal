import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { canManagePermissions } from '@/lib/roles'
import TitlesSection, { type TitleRow, type DepartmentOption } from './_components/TitlesSection'
import PermissionMatrix, {
  type MatrixTitle,
  type PermissionDef,
  type RoleDefaults,
} from './_components/PermissionMatrix'

/**
 * Role & Permission.
 *
 * Two halves: which titles exist and which department each sits under, and
 * what each title is allowed to do. The second is the portal's authorisation
 * model since 2026-09-01 — RLS derives its scopes from the same permissions,
 * so a title cannot be granted a page whose queries then come back empty.
 */
export default async function RolesPage() {
  const user = await requirePermission('team')
  const supabase = await createClient()

  const [
    { data: titles },
    { data: departments },
    { data: holders },
    { data: defs },
    { data: grants },
    { data: roleRows },
  ] = await Promise.all([
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
    supabase
      .from('permission_defs')
      .select('key, label, section, scope, description')
      .order('sort_order'),
    supabase.from('title_permissions').select('title_id, permission_key'),
    supabase.from('role_default_permissions').select('role, permission_key'),
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

  // A title with no rows inherits; one with rows is authoritative. Null and
  // empty mean different things, so they are kept apart all the way to the UI.
  const grantsByTitle = new Map<string, string[]>()
  for (const g of grants ?? []) {
    const row = g as { title_id: string; permission_key: string }
    const list = grantsByTitle.get(row.title_id)
    if (list) list.push(row.permission_key)
    else grantsByTitle.set(row.title_id, [row.permission_key])
  }

  const matrixTitles: MatrixTitle[] = rows.map(t => ({
    id: t.id,
    name: t.name,
    departmentName: t.departmentName,
    people: t.people,
    granted: grantsByTitle.get(t.id) ?? null,
  }))

  const byRole = new Map<string, string[]>()
  for (const r of roleRows ?? []) {
    const row = r as { role: string; permission_key: string }
    const list = byRole.get(row.role)
    if (list) list.push(row.permission_key)
    else byRole.set(row.role, [row.permission_key])
  }
  const roleDefaults: RoleDefaults[] = ['principal', 'finance', 'hr', 'dept_manager'].map(
    role => ({ role, keys: byRole.get(role) ?? [] }),
  )

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> PEOPLE · ROLE &amp; PERMISSION
          </div>
          <h1 className="page-title">Roles</h1>
          <p className="font-serif italic text-graphite text-base mt-3 max-w-2xl">
            A title says what somebody is called, which department that role
            belongs under, and what it is allowed to do. A title with no
            permissions of its own falls back to the role each holder&apos;s
            account was created with.
          </p>
        </div>
      </div>

      <TitlesSection
        titles={rows}
        departments={deptOptions}
        canDelete={canManagePermissions(user)}
      />

      <PermissionMatrix
        defs={(defs ?? []) as PermissionDef[]}
        titles={matrixTitles}
        roleDefaults={roleDefaults}
        canEdit={canManagePermissions(user)}
      />
    </div>
  )
}
