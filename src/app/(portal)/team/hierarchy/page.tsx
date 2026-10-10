import { requirePermission } from '@/lib/auth'
import { canManagePermissions } from '@/lib/roles'
import { canDo } from '@/lib/permission-actions'
import { readOrgChart, readsStaffTable } from '@/lib/team-directory'
import { createClient } from '@/lib/supabase/server'
import { pickHomeSubDepartments, revenuePath, subDeptSlug } from '@/lib/revenue'
import { ladderBreaks, type Rung } from '@/lib/ladder'
import { companyHierarchyRoles, type CompanyChartMembership, type CompanyChartSubDepartment } from '@/lib/company-hierarchy-roles'
import type { SupabaseClient } from '@supabase/supabase-js'
import HierarchyView from './_components/HierarchyView'
import type { ChartPerson } from './_components/TeamOrgChart'
import type { RolePerson, RoleTitle } from '@/lib/hierarchy-roles'

/**
 * The roster is authoritative for company titles, reporting lines, Table and
 * Levels. The chart also includes each person's open memberships in additional
 * Revenue sub-departments, with the title and upline held in that scheme.
 * These independent roles are edited on their own Revenue hierarchy; their
 * synthetic card IDs must never be sent to the company reporting writer.
 *
 * Department heads stay real staff cards. Each role's derived director lines
 * come from its particular sub-department and carry no commission override.
 * Pay rates stay on Revenue, where the relevant period is in scope.
 */
export default async function TeamHierarchyPage() {
  // The roster's own key — or Team · View without the Salary tick, which draws
  // the whole company's chart from team_org_chart(): names and titles, read
  // only (2026-10-10, PR4b; the user's 2b).
  const user = await requirePermission('team', 'team_directory')
  const supabase = await createClient()
  const untyped = supabase as unknown as import('@supabase/supabase-js').SupabaseClient
  const direct = readsStaffTable(user)
  // A directory reader's chart comes in one read; the commission positions,
  // the title rules and the schemes are Revenue's and not theirs to read.
  const chart = direct ? null : readOrgChart(supabase)
  const fromChart = <T,>(pick: (c: Awaited<NonNullable<typeof chart>>) => T) =>
    chart!.then(c => ({ data: pick(c), error: null }))
  const none = Promise.resolve({ data: [] as never[], error: null })

  const [staffResult, levelsResult, titlesResult, ranksResult, subsResult, schemesResult, directorsResult, memberships, deptResult, templatesResult] =
    await Promise.all([
      direct
        ? supabase
            .from('hr_staff_costs')
            .select(
              'id, employee_name, employee_code, reports_to, designation, title_id, department_id, titles(name, level_id, is_department_head), departments(name, payroll_source)',
            )
            .eq('status', 'active')
            .order('employee_name')
        : fromChart(c => c.people),
      supabase.from('title_levels').select('id, rank, name').order('rank'),
      // Every title, inactive ones too: the board shows those dimmed rather
      // than dropping them off the ladder while somebody still holds one.
      supabase
        .from('titles')
        .select('id, name, department_id, level_id, is_active, is_department_head, template_id, departments (name)')
        .order('name'),
      // Who may hold downlines, per commission department and title — the
      // recruit rule, asked the way the database asks it: on the department's
      // HOME sub-department's ladder (its oldest). The comm_* tables postdate
      // database.types.ts, hence the cast.
      direct ? untyped
        .from('comm_ranks')
        .select('scheme_id, title_id, can_recruit') : none,
      // Checked here because a failed sub-department or scheme query must
      // not silently turn a person with several roles into a single card.
      direct
        ? untyped.from('comm_sub_departments').select('id, name, department_id, created_at')
            .eq('is_active', true).order('name')
        : fromChart(c => c.subDepartments),
      direct ? untyped.from('comm_schemes').select('id, sub_department_id')
        .eq('is_active', true).is('effective_to', null) : none,
      direct ? untyped.from('comm_sub_department_directors').select('staff_id, sub_department_id') : fromChart(c => c.directors),
      direct ? loadOpenMemberships(untyped) : Promise.resolve([] as CompanyChartMembership[]),
      // The Roles tab: the department picker, and each title's template by name.
      supabase.from('departments').select('id, name').order('name'),
      untyped.from('permission_templates').select('id, name'),
    ])

  for (const [label, result] of [
    ['staff roster', staffResult], ['title levels', levelsResult], ['titles', titlesResult],
    ['commission title rules', ranksResult], ['Revenue sub-departments', subsResult],
    ['Revenue schemes', schemesResult], ['sub-department directors', directorsResult],
    ['departments', deptResult], ['permission templates', templatesResult],
  ] as const) {
    if (result.error) throw new Error(`Could not load ${label} for the company hierarchy: ${result.error.message}`)
  }
  const staffRows = staffResult.data
  const levels = levelsResult.data
  const titles = titlesResult.data
  const rungRows = (ranksResult.data ?? []) as Array<{ scheme_id: string; title_id: string | null; can_recruit: boolean }>
  const directorRows = (directorsResult.data ?? []) as Array<{ staff_id: string; sub_department_id: string }>
  const subs = (subsResult.data ?? []) as Array<{ id: string; name: string; department_id: string; created_at: string }>
  const home = pickHomeSubDepartments(subs.map(sub => ({ id: sub.id, departmentId: sub.department_id, createdAt: sub.created_at })))
  const schemeBySub = new Map(((schemesResult.data ?? []) as Array<{ id: string; sub_department_id: string }>)
    .map(scheme => [scheme.sub_department_id, scheme.id]))
  const subDepts: CompanyChartSubDepartment[] = subs.map(sub => ({
    id: sub.id, name: sub.name, slug: subDeptSlug(sub.name), departmentId: sub.department_id,
    schemeId: schemeBySub.get(sub.id) ?? null, isHome: home.has(sub.id),
  }))

  const rungs: Rung[] = ((levels ?? []) as Array<{ id: string; rank: number; name: string }>).map(
    l => ({ id: l.id, rank: l.rank, name: l.name }),
  )
  const rungById = new Map(rungs.map(r => [r.id, r]))

  const homeByScheme = new Map(subDepts.filter(sub => sub.isHome && sub.schemeId).map(sub => [sub.schemeId, sub]))
  const recruit = new Map<string, boolean>()
  for (const r of rungRows) {
    const sub = homeByScheme.get(r.scheme_id)
    if (!sub || !r.title_id) continue
    const key = `${sub.departmentId}:${r.title_id}`
    recruit.set(key, (recruit.get(key) ?? false) || r.can_recruit)
  }

  const staff = (staffRows ?? []) as unknown as Array<{
    id: string
    employee_name: string
    employee_code: string | null
    reports_to: string | null
    designation: string | null
    title_id: string | null
    department_id: string | null
    titles: { name: string; level_id: string | null; is_department_head: boolean | null } | null
    departments: { name: string; payroll_source: string } | null
  }>
  const staffById = new Map(staff.map(s => [s.id, s]))

  // The heads each commission department's HOME sub-department reports to,
  // A→Z by name — the order the layout hangs a tree from the first of them.
  // A row pointing at somebody inactive is not drawn; the roster decides.
  const subById = new Map(subDepts.map(s => [s.id, s]))
  const headsByDept = new Map<string, Array<{ id: string; name: string }>>()
  for (const row of (directorRows ?? []) as Array<{ staff_id: string; sub_department_id: string }>) {
    const sub = subById.get(row.sub_department_id)
    const head = staffById.get(row.staff_id)
    if (!sub?.isHome || !head || !head.titles?.is_department_head) continue
    const list = headsByDept.get(sub.departmentId) ?? []
    if (!list.some(h => h.id === head.id)) list.push({ id: head.id, name: head.employee_name })
    headsByDept.set(sub.departmentId, list)
  }
  for (const list of headsByDept.values()) list.sort((a, b) => a.name.localeCompare(b.name))

  const people: ChartPerson[] = staff.map(s => {
    const rung = s.titles?.level_id ? (rungById.get(s.titles.level_id) ?? null) : null
    const commissionDept = s.departments?.payroll_source === 'commission'
    const isDepartmentHead = s.titles?.is_department_head === true
    const key = s.department_id && s.title_id ? `${s.department_id}:${s.title_id}` : null
    return {
      id: s.id,
      name: s.employee_name,
      code: s.employee_code,
      title: s.titles?.name ?? s.designation ?? null,
      department: s.departments?.name ?? null,
      // The department facts the chart decides on rather than merely prints:
      // a reporting line may not cross the edge of a commission department,
      // and inside one it may only go to a title that may hold downlines — a
      // head may hold everybody's, without a rung.
      commissionDept,
      canRecruit: commissionDept ? (isDepartmentHead ? true : key ? (recruit.get(key) ?? null) : null) : null,
      isDepartmentHead,
      leadIds:
        commissionDept && !isDepartmentHead && s.department_id
          ? (headsByDept.get(s.department_id) ?? []).map(h => h.id).filter(id => id !== s.id)
          : [],
      levelRank: rung?.rank ?? null,
      levelName: rung?.name ?? null,
      reportsTo: s.reports_to,
    }
  })

  const chartPeople = companyHierarchyRoles({
    people,
    departmentIds: new Map(staff.map(person => [person.id, person.department_id])),
    subDepartments: subDepts,
    memberships,
    ranks: rungRows.map(rank => ({ schemeId: rank.scheme_id, titleId: rank.title_id, canRecruit: rank.can_recruit })),
    levels: rungs,
    directors: directorRows.map(director => ({ staffId: director.staff_id, subDepartmentId: director.sub_department_id })),
  })

  // Every title with its rung and template — People & roles' bands, Levels'
  // chips (2026-10-10, the HR revamp) — and the roster by title.
  const templateNames = new Map(((templatesResult.data ?? []) as Array<{ id: string; name: string }>).map(t => [t.id, t.name]))
  const roleTitles: RoleTitle[] = (titles ?? []).map(t => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const r = t as any
    return {
      id: r.id,
      name: r.name,
      departmentId: r.department_id ?? null,
      departmentName: r.departments?.name ?? null,
      levelId: r.level_id ?? null,
      isActive: r.is_active,
      isDepartmentHead: r.is_department_head === true,
      templateId: r.template_id ?? null,
      templateName: r.template_id ? (templateNames.get(r.template_id) ?? null) : null,
    }
  })
  const rolePeople: RolePerson[] = staff.map(s => ({
    id: s.id,
    name: s.employee_name,
    titleId: s.title_id,
    department: s.departments?.name ?? null,
    reportsTo: s.reports_to,
  }))

  // Lines the ladder, as it stands now, would refuse. The trigger only checks
  // a line when it is drawn, so a ladder edited after the fact can leave some;
  // the panel says which, and the chart paints them red.
  const breaks = ladderBreaks(
    people.map(p => ({ id: p.id, reportsTo: p.reportsTo, rank: p.levelRank })),
  )

  // Where the legend's one link goes. There are several sub-departments, so
  // the first alphabetically is an arbitrary choice among them — the same
  // arbitrary choice `/revenue` itself makes when it redirects, which is why
  // it is the least surprising one available.
  const commissionHref = subDepts[0] ? revenuePath(subDepts[0].slug, 'hierarchy') : null

  return (
    <HierarchyView
      people={people}
      chartPeople={chartPeople}
      commissionHref={commissionHref}
      rungs={rungs}
      breaks={breaks}
      roleTitles={roleTitles}
      rolePeople={rolePeople}
      departments={(deptResult.data ?? []).map(d => ({ id: d.id, name: d.name }))}
      canDeleteTitles={canManagePermissions(user)}
      canEdit={canDo(user, 'team', 'edit')}
      canManage={canDo(user, 'team', 'manage')}
      chartOnly={!direct}
    />
  )
}

/** Same open-membership rule as loadTeam, read with the authenticated client. */
async function loadOpenMemberships(supabase: SupabaseClient): Promise<CompanyChartMembership[]> {
  const result: CompanyChartMembership[] = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from('comm_hierarchy')
      .select('id, staff_id, scheme_id, upline_staff_id, title_id, titles (name, level_id), comm_schemes!inner (is_active, effective_to)')
      .is('effective_to', null)
      .eq('comm_schemes.is_active', true)
      .is('comm_schemes.effective_to', null)
      .order('id').range(from, from + pageSize - 1)
    if (error) throw new Error(`Could not load Revenue memberships for the company hierarchy: ${error.message}`)
    const rows = (data ?? []) as Array<{
      staff_id: string; scheme_id: string; upline_staff_id: string | null; title_id: string | null
      titles: { name: string; level_id: string | null } | Array<{ name: string; level_id: string | null }> | null
    }>
    result.push(...rows.map(row => {
      const title = Array.isArray(row.titles) ? row.titles[0] : row.titles
      return {
        staffId: row.staff_id, schemeId: row.scheme_id, uplineStaffId: row.upline_staff_id,
        titleId: row.title_id, title: title ? { name: title.name, levelId: title.level_id } : null,
      }
    }))
    if (rows.length < pageSize) return result
  }
}
