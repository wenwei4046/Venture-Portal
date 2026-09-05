import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { revenuePath } from '@/lib/revenue'
import { ladderBreaks, type Rung } from '@/lib/ladder'
import { listSubDepartments } from '../../revenue/_lib/sub-departments'
import HierarchyTabs from './_components/HierarchyTabs'
import type { ChartPerson } from './_components/TeamOrgChart'
import type { BoardTitle } from './_components/LevelsBoard'

/**
 * Hierarchy: the company org chart and the ladder it obeys — two tabs, side
 * by side, on one page. This file loads both; `HierarchyTabs` shows the one
 * `?tab=` asks for.
 *
 * ORG CHART — every department on one canvas. Two lines are drawn and only
 * one of them is editable here:
 *
 *   reports_to        solid, draggable. Current state, no history. This page
 *                     writes it.
 *   commission upline dashed, read-only. `comm_hierarchy` is what the override
 *                     differential is computed from, it is effective-dated, and
 *                     a month already run keeps the chart it was run against.
 *                     Changing it is the Revenue Department's own hierarchy
 *                     page, which this one links to.
 *
 * Drawing both was the point (user, 2026-09-01): the Revenue team's structure
 * stops being an island you have to open a different page to see, and where
 * the two disagree — the commission upline is not the line manager — that is
 * now visible instead of implicit.
 *
 * LEVELS — the ladder. One scale for the whole company, every title pinned to
 * a rung; since 2026-09-03 the chart obeys it (nobody can be dropped under
 * somebody whose title stands lower than theirs) and a promotion climbs it.
 * It lived on the Roles page until 2026-09-05, when the user moved it here as
 * the second tab: the rule and the place it is felt, one click apart. The
 * ladder says how high, never where — moving people between departments
 * stays a gesture on the chart.
 */
export default async function TeamHierarchyPage() {
  await requirePermission('team')
  const supabase = await createClient()

  const [{ data: staffRows }, { data: positions }, { data: levels }, { data: titles }, subDepts] =
    await Promise.all([
      supabase
        .from('hr_staff_costs')
        .select(
          'id, employee_name, employee_code, reports_to, designation, title_id, titles(name, level_id), departments(name)',
        )
        .eq('status', 'active')
        .order('employee_name'),
      supabase
        .from('comm_hierarchy')
        .select('staff_id, upline_staff_id')
        .is('effective_to', null),
      supabase.from('title_levels').select('id, rank, name').order('rank'),
      // Every title, inactive ones too: the board shows those dimmed rather
      // than dropping them off the ladder while somebody still holds one.
      supabase
        .from('titles')
        .select('id, name, department_id, level_id, is_active, departments (name)')
        .order('name'),
      listSubDepartments(),
    ])

  const commUpline = new Map<string, string | null>(
    ((positions ?? []) as Array<{ staff_id: string; upline_staff_id: string | null }>).map(p => [
      p.staff_id,
      p.upline_staff_id,
    ]),
  )

  const rungs: Rung[] = ((levels ?? []) as Array<{ id: string; rank: number; name: string }>).map(
    l => ({ id: l.id, rank: l.rank, name: l.name }),
  )
  const rungById = new Map(rungs.map(r => [r.id, r]))

  const staff = (staffRows ?? []) as unknown as Array<{
    id: string
    employee_name: string
    employee_code: string | null
    reports_to: string | null
    designation: string | null
    title_id: string | null
    titles: { name: string; level_id: string | null } | null
    departments: { name: string } | null
  }>

  const people: ChartPerson[] = staff.map(s => {
    const rung = s.titles?.level_id ? (rungById.get(s.titles.level_id) ?? null) : null
    return {
      id: s.id,
      name: s.employee_name,
      code: s.employee_code,
      title: s.titles?.name ?? s.designation ?? null,
      department: s.departments?.name ?? null,
      levelRank: rung?.rank ?? null,
      levelName: rung?.name ?? null,
      reportsTo: s.reports_to,
      // Only carried when it is a line the reporting tree does not already draw;
      // an identical dashed edge on top of a solid one is noise.
      commUplineId: commUpline.get(s.id) ?? null,
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
  // the board says how many and the chart paints them red.
  const breaks = ladderBreaks(
    people.map(p => ({ id: p.id, reportsTo: p.reportsTo, rank: p.levelRank })),
  ).length

  // One link is enough while Fair is the only sub-department; when there are
  // more, the first is still the right place to land.
  const commissionHref = subDepts[0] ? revenuePath(subDepts[0].slug, 'hierarchy') : null

  return (
    <HierarchyTabs
      people={people}
      commissionHref={commissionHref}
      rungs={rungs}
      titles={boardTitles}
      breaks={breaks}
    />
  )
}
