import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { canAccessRevenue } from '@/lib/roles'
import { revenuePath } from '@/lib/revenue'
import { ladderBreaks, type Rung } from '@/lib/ladder'
import { ratePct } from '@/lib/commission/ranks'
import { listSubDepartments } from '../../revenue/_lib/sub-departments'
import HierarchyView from './_components/HierarchyView'
import type { ChartPerson } from './_components/TeamOrgChart'
import type { BoardTitle } from './_components/LevelsBoard'
import type { SalesPerson, RankOption } from './_components/HierarchyPanel'

/**
 * Hierarchy: the company org chart, and everything that governs it, on one
 * screen.
 *
 * The chart is the page (user, 2026-09-07: "graph UI takes priority").
 *
 * ONE LINE is drawn on the canvas: `hr_staff_costs.reports_to`, who somebody
 * reports to. Current state, no history.
 *
 * The commission tree used to be drawn beside it, and is not any more (user,
 * 2026-09-08). It was removed for a reason worth keeping written down, because
 * the obvious reading is that it was clutter and it was not: the rank a
 * position carries is NOT what a month pays. A salesperson who misses their
 * monthly quota earns at a different rate from the one their rank implies, so
 * a chart captioning somebody "Rank B · 8%" states as a fact about them
 * something that is only true in the months they hit quota. There is no
 * caption this page could have written instead — the real figure is a
 * property of a RUN, not of a person — so the honest move was to stop
 * answering the question here. The commission tree is drawn and edited on
 * `/revenue/[sub]/hierarchy`, where a period is in scope and the number means
 * something.
 *
 * The DOUBLE WRITE is untouched by that. Moving somebody here still moves
 * their commission upline with them, and still says so when it cannot — see
 * `lib/hierarchy-mirror.ts`. What went away is the drawing, not the write:
 * the two lines drifting apart in silence was the original bug and it stays
 * fixed.
 *
 * THE LADDER is one scale for the whole company, every title pinned to a rung.
 * The chart obeys it — nobody can be dropped under somebody whose title stands
 * lower — and a promotion climbs it. It says how high, never where; moving
 * people between departments stays a gesture on the chart.
 */
export default async function TeamHierarchyPage() {
  const user = await requirePermission('team')
  const supabase = await createClient()
  // Rates no longer reach a card on this page, but they still reach the enrol
  // offer's rank picker — that one is a CHOICE being made rather than a figure
  // captioning somebody, which is the whole distinction the rank display was
  // removed over. This page is gated on `team` and the two permissions share
  // the `hr` RLS scope, so the query below would happily return rates to an
  // account with no `revenue`: the withholding has to happen here, before
  // anything reaches a client component.
  const seesMoney = canAccessRevenue(user)

  const [{ data: staffRows }, { data: positions }, { data: levels }, { data: titles }, subDepts] =
    await Promise.all([
      supabase
        .from('hr_staff_costs')
        .select(
          'id, employee_name, employee_code, reports_to, designation, title_id, titles(name, level_id), departments(name, payroll_source)',
        )
        .eq('status', 'active')
        .order('employee_name'),
      // The commission side. Read for two things only, neither of them drawn:
      // the upline an undo has to be able to put back, and the scheme an enrol
      // offer defaults its picker to.
      supabase
        .from('comm_hierarchy')
        .select('staff_id, upline_staff_id, scheme_id')
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

  interface PositionRow {
    staff_id: string
    upline_staff_id: string | null
    scheme_id: string
  }

  const positionRows = (positions ?? []) as unknown as PositionRow[]
  const commUpline = new Map<string, string | null>(
    positionRows.map(p => [p.staff_id, p.upline_staff_id]),
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
    departments: { name: string; payroll_source: string } | null
  }>

  const people: ChartPerson[] = staff.map(s => {
    const rung = s.titles?.level_id ? (rungById.get(s.titles.level_id) ?? null) : null
    return {
      id: s.id,
      name: s.employee_name,
      code: s.employee_code,
      title: s.titles?.name ?? s.designation ?? null,
      department: s.departments?.name ?? null,
      // The one department fact the chart decides on rather than merely prints:
      // a reporting line may not cross the edge of a commission department.
      commissionDept: s.departments?.payroll_source === 'commission',
      levelRank: rung?.rank ?? null,
      levelName: rung?.name ?? null,
      reportsTo: s.reports_to,
      // Carried, never drawn. An undo has to be able to put back the line the
      // move changed, and after the write this page holds no other copy of it.
      commUplineId: commUpline.get(s.id) ?? null,
    }
  })

  // Who the commission engine holds an open position for, and under which
  // scheme. Two fields, because an enrol offer needs to default its scheme
  // picker to the MOVER's — an override belongs to one scheme, so a manager
  // enrolled into a different one is refused by the very mirror the offer is
  // trying to complete.
  const salespeople: SalesPerson[] = positionRows.map(p => ({
    staffId: p.staff_id,
    schemeId: p.scheme_id,
  }))

  // The ranks an enrol offer may pick from, scoped per scheme because a rank is
  // a scheme's row — offering Fair's ladder to somebody placed under another
  // sub-department's scheme would write a rank its engine cannot read.
  const schemeIds = [...new Set(positionRows.map(p => p.scheme_id))]
  let ranksByScheme: Record<string, RankOption[]> = {}
  if (schemeIds.length > 0 && seesMoney) {
    const { data: rankRows } = await supabase
      .from('comm_ranks')
      .select('id, scheme_id, label, product_rate, sort_order')
      .in('scheme_id', schemeIds)
      .order('sort_order')
    const grouped: Record<string, RankOption[]> = {}
    for (const r of (rankRows ?? []) as unknown as Array<{
      id: string
      scheme_id: string
      label: string
      product_rate: number | string
      sort_order: number
    }>) {
      ;(grouped[r.scheme_id] ??= []).push({
        id: r.id,
        label: r.label,
        rateLabel: ratePct(Number(r.product_rate)),
        sortOrder: r.sort_order,
      })
    }
    ranksByScheme = grouped
  }

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
  // it is the least surprising one available. A link that knew whose tree the
  // reader wanted would have to be per-card, and this one sits in the legend.
  const commissionHref = subDepts[0] ? revenuePath(subDepts[0].slug, 'hierarchy') : null

  return (
    <HierarchyView
      people={people}
      commissionHref={commissionHref}
      rungs={rungs}
      titles={boardTitles}
      breaks={breaks}
      salespeople={salespeople}
      ranksByScheme={ranksByScheme}
    />
  )
}
