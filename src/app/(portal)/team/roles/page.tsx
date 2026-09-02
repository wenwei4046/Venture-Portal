import Link from 'next/link'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { canManagePermissions } from '@/lib/roles'
import { ladderBreaks, type Rung } from '@/lib/ladder'
import TitlesSection, { type TitleRow, type DepartmentOption } from './_components/TitlesSection'
import LevelsBoard, { type BoardTitle } from './_components/LevelsBoard'

/**
 * Roles.
 *
 * What a title IS: which titles exist, which department each belongs under,
 * and — since 2026-09-03 — how high each stands on the company ladder. What a
 * title may DO is the Permissions page next door; the two shared a page as
 * "Role & Permission" until the user asked for them apart.
 *
 * The ladder is the rule the Hierarchy page obeys and the thing a promotion
 * climbs. It is set here because it is a fact about titles, not about people:
 * an Assistant Manager stands below a Manager whoever holds either.
 */
export default async function RolesPage() {
  const user = await requirePermission('team')
  const supabase = await createClient()

  const [{ data: titles }, { data: departments }, { data: staff }, { data: levels }] =
    await Promise.all([
      supabase
        .from('titles')
        .select('id, name, department_id, level_id, is_active, departments (name)')
        .order('name'),
      supabase.from('departments').select('id, name').order('name'),
      // Active people: the headcount per title, and the reporting lines the
      // ladder is checked against.
      supabase
        .from('hr_staff_costs')
        .select('id, title_id, reports_to')
        .eq('status', 'active'),
      supabase.from('title_levels').select('id, rank, name').order('rank'),
    ])

  const people = (staff ?? []) as Array<{
    id: string
    title_id: string | null
    reports_to: string | null
  }>

  const headcount = new Map<string, number>()
  for (const p of people) {
    if (!p.title_id) continue
    headcount.set(p.title_id, (headcount.get(p.title_id) ?? 0) + 1)
  }

  const rows: Array<TitleRow & { levelId: string | null }> = (titles ?? []).map(t => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const r = t as any
    return {
      id: r.id,
      name: r.name,
      departmentId: r.department_id ?? null,
      departmentName: r.departments?.name ?? null,
      levelId: r.level_id ?? null,
      isActive: r.is_active,
      people: headcount.get(r.id) ?? 0,
    }
  })

  const deptOptions: DepartmentOption[] = (departments ?? []).map(d => ({
    id: d.id,
    name: d.name,
  }))

  const rungs: Rung[] = (levels ?? []).map(l => ({ id: l.id, rank: l.rank, name: l.name }))

  const boardTitles: BoardTitle[] = rows.map(t => ({
    id: t.id,
    name: t.name,
    departmentId: t.departmentId,
    departmentName: t.departmentName,
    levelId: t.levelId,
    people: t.people,
    isActive: t.isActive,
  }))

  // Lines on the org chart that the ladder, as it stands now, would refuse.
  // The trigger only checks a line when it is drawn, so a ladder edited after
  // the fact can leave some; the board says how many and the chart marks them.
  const rankByLevel = new Map(rungs.map(r => [r.id, r.rank]))
  const rankByTitle = new Map(
    rows.map(t => [t.id, t.levelId ? (rankByLevel.get(t.levelId) ?? null) : null]),
  )
  const breaks = ladderBreaks(
    people.map(p => ({
      id: p.id,
      reportsTo: p.reports_to,
      rank: p.title_id ? (rankByTitle.get(p.title_id) ?? null) : null,
    })),
  ).length

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> PEOPLE · ROLES
          </div>
          <h1 className="page-title">Roles</h1>
          <p className="font-serif italic text-graphite text-base mt-3 max-w-2xl">
            A title says what somebody is called and which department that role
            belongs under; the ladder says how high it stands. What each title
            is allowed to do is on{' '}
            <Link href="/team/permissions" className="text-accent hover:underline not-italic">
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

      <LevelsBoard rungs={rungs} titles={boardTitles} breaks={breaks} />
    </div>
  )
}
