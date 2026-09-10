import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { revenuePath } from '@/lib/revenue'
import { ladderBreaks, type Rung } from '@/lib/ladder'
import { listSubDepartments } from '../../revenue/_lib/sub-departments'
import HierarchyView from './_components/HierarchyView'
import type { ChartPerson } from './_components/TeamOrgChart'
import type { BoardTitle } from './_components/LevelsBoard'

/**
 * Hierarchy: the company org chart, and everything that governs it, on one
 * screen.
 *
 * The chart is the page (user, 2026-09-07: "graph UI takes priority").
 *
 * ONE LINE is drawn on the canvas: `hr_staff_costs.reports_to`, who somebody
 * reports to. Current state, no history. Since 2026-09-10 it is also the only
 * line there is: inside a commission department who somebody reports to IS
 * who earns the override on their sales, and the commission position the
 * engine reads is derived from this column by the database. There is nothing
 * to mirror, offer, or say about a second line any more — a move here is the
 * move.
 *
 * What the commission side still adds is not drawn here on purpose (user,
 * 2026-09-08): the rank a position carries is NOT what a month pays — a
 * salesperson who misses their monthly quota earns at a different rate — so
 * a caption reading "Rank B · 8%" would state as a fact something only true
 * in the months quota was hit. The rank is read and set on
 * `/revenue/[sub]/hierarchy`, where a period is in scope.
 *
 * THE LADDER is one scale for the whole company, every title pinned to a rung.
 * The chart obeys it — nobody can be dropped under somebody whose title stands
 * lower — and a promotion climbs it. Inside a commission department a second
 * rule joins it: you may only report to a title that may hold downlines.
 */
export default async function TeamHierarchyPage() {
  await requirePermission('team')
  const supabase = await createClient()

  const [{ data: staffRows }, { data: levels }, { data: titles }, { data: rungRows }, subDepts] =
    await Promise.all([
      supabase
        .from('hr_staff_costs')
        .select(
          'id, employee_name, employee_code, reports_to, designation, title_id, department_id, titles(name, level_id), departments(name, payroll_source)',
        )
        .eq('status', 'active')
        .order('employee_name'),
      supabase.from('title_levels').select('id, rank, name').order('rank'),
      // Every title, inactive ones too: the board shows those dimmed rather
      // than dropping them off the ladder while somebody still holds one.
      supabase
        .from('titles')
        .select('id, name, department_id, level_id, is_active, departments (name)')
        .order('name'),
      // Who may hold downlines, per commission department and title — the
      // recruit rule, asked the way the database asks it. The comm_* tables
      // postdate database.types.ts, hence the cast.
      (supabase as unknown as import('@supabase/supabase-js').SupabaseClient)
        .from('comm_ranks')
        .select('title_id, can_recruit, comm_schemes!inner (comm_sub_departments!inner (department_id))'),
      listSubDepartments(),
    ])

  const rungs: Rung[] = ((levels ?? []) as Array<{ id: string; rank: number; name: string }>).map(
    l => ({ id: l.id, rank: l.rank, name: l.name }),
  )
  const rungById = new Map(rungs.map(r => [r.id, r]))

  const recruit = new Map<string, boolean>()
  for (const r of (rungRows ?? []) as unknown as Array<{
    title_id: string
    can_recruit: boolean
    comm_schemes: { comm_sub_departments: { department_id: string } | { department_id: string }[] } | null
  }>) {
    const sub = r.comm_schemes?.comm_sub_departments
    const dept = Array.isArray(sub) ? sub[0]?.department_id : sub?.department_id
    if (!dept) continue
    const key = `${dept}:${r.title_id}`
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
    titles: { name: string; level_id: string | null } | null
    departments: { name: string; payroll_source: string } | null
  }>

  const people: ChartPerson[] = staff.map(s => {
    const rung = s.titles?.level_id ? (rungById.get(s.titles.level_id) ?? null) : null
    const commissionDept = s.departments?.payroll_source === 'commission'
    const key = s.department_id && s.title_id ? `${s.department_id}:${s.title_id}` : null
    return {
      id: s.id,
      name: s.employee_name,
      code: s.employee_code,
      title: s.titles?.name ?? s.designation ?? null,
      department: s.departments?.name ?? null,
      // The department facts the chart decides on rather than merely prints:
      // a reporting line may not cross the edge of a commission department,
      // and inside one it may only go to a title that may hold downlines.
      commissionDept,
      canRecruit: commissionDept ? (key ? (recruit.get(key) ?? null) : null) : null,
      levelRank: rung?.rank ?? null,
      levelName: rung?.name ?? null,
      reportsTo: s.reports_to,
    }
  })

  // The board: every title as a chip, with the headcount holding it.
  const headcount = new Map<string, number>()
  for (const s of staff) {
    if (!s.title_id) continue
    headcount.set(s.title_id, (headcount.get(s.title_id) ?? 0) + 1)
  }
  const boardTitles: BoardTitle[] = (titles ?? []).map(t => {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const r = t as any
    return {
      id: r.id,
      name: r.name,
      departmentId: r.department_id ?? null,
      departmentName: r.departments?.name ?? null,
      levelId: r.level_id ?? null,
      people: headcount.get(r.id) ?? 0,
      isActive: r.is_active,
    }
  })

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
      commissionHref={commissionHref}
      rungs={rungs}
      titles={boardTitles}
      breaks={breaks}
    />
  )
}
