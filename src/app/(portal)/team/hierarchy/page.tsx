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
 * The chart is the page (user, 2026-09-07: "graph UI takes priority"). What
 * used to be a second tab you left the chart to read is now a panel BESIDE it —
 * the salespeople's own tree, and the ladder the chart obeys. A rule you have
 * to navigate away from to check is a rule you check less often than you
 * should.
 *
 * TWO LINES are drawn on the canvas, and since 2026-09-07 both are written:
 *
 *   reports_to        solid. The company reporting line. Current state, no
 *                     history.
 *   commission upline dashed. `comm_hierarchy` — what the override
 *                     differential is computed from, effective-dated so a
 *                     month already run keeps the chart it was run against.
 *
 * They used to be edited on different pages under different permissions, and
 * drifted apart in silence. Moving somebody on either now moves them on both
 * where the account is allowed to write both; where it is not, the move still
 * happens and the page says which half did not. See `lib/hierarchy-mirror.ts`.
 *
 * THE LADDER is one scale for the whole company, every title pinned to a rung.
 * The chart obeys it — nobody can be dropped under somebody whose title stands
 * lower — and a promotion climbs it. It says how high, never where; moving
 * people between departments stays a gesture on the chart.
 */
export default async function TeamHierarchyPage() {
  const user = await requirePermission('team')
  const supabase = await createClient()
  // What a month pays somebody is commission data, and this page is gated on
  // `team`. The two permissions happen to share the `hr` RLS scope, so the
  // query below WILL return rates to an account with no `revenue` — the
  // withholding has to happen here, before anything reaches a client
  // component, not at the control that edits them. A rate that is merely not
  // editable is still a rate the reader now knows.
  const seesMoney = canAccessRevenue(user)

  const [{ data: staffRows }, { data: positions }, { data: levels }, { data: titles }, subDepts] =
    await Promise.all([
      supabase
        .from('hr_staff_costs')
        .select(
          'id, employee_name, employee_code, reports_to, designation, title_id, titles(name, level_id), departments(name)',
        )
        .eq('status', 'active')
        .order('employee_name'),
      // The commission side. `comm_*` postdates database.types.ts, and the
      // embedded rank comes back as an object or a one-element array depending
      // on how PostgREST resolves the relationship — both shapes are handled.
      supabase
        .from('comm_hierarchy')
        .select('staff_id, upline_staff_id, scheme_id, rank_id, comm_ranks (label, product_rate, sort_order)')
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
    rank_id: string | null
    comm_ranks:
      | { label: string; product_rate: number | string; sort_order: number }
      | Array<{ label: string; product_rate: number | string; sort_order: number }>
      | null
  }
  const one = <T,>(v: T | T[] | null | undefined): T | null =>
    !v ? null : Array.isArray(v) ? (v[0] ?? null) : v

  const positionRows = (positions ?? []) as unknown as PositionRow[]
  const commUpline = new Map<string, string | null>(
    positionRows.map(p => [p.staff_id, p.upline_staff_id]),
  )
  const position = new Map(positionRows.map(p => [p.staff_id, p]))

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
    const rank = one(position.get(s.id)?.comm_ranks)
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
      rankLabel: seesMoney ? (rank?.label ?? null) : null,
      rankRate: seesMoney && rank ? Number(rank.product_rate) : null,
    }
  })

  // The panel's own tree: only the people the commission engine knows about,
  // in their own shape, so the aside is a second hierarchy rather than the same
  // one filtered.
  const nameOf = new Map(staff.map(s => [s.id, s.employee_name]))
  const deptOf = new Map(staff.map(s => [s.id, s.departments?.name ?? null]))
  const salespeople: SalesPerson[] = positionRows
    .filter(p => nameOf.has(p.staff_id))
    .map(p => {
      const rank = one(p.comm_ranks)
      return {
        staffId: p.staff_id,
        name: nameOf.get(p.staff_id)!,
        department: deptOf.get(p.staff_id) ?? null,
        uplineStaffId: p.upline_staff_id,
        rankId: p.rank_id,
        rankLabel: seesMoney ? (rank?.label ?? null) : null,
        rateLabel: seesMoney && rank ? ratePct(Number(rank.product_rate)) : null,
        schemeId: p.scheme_id,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  // The rank a table cell may pick from. Scoped per scheme because a rank is a
  // scheme's row — offering Fair's ladder to somebody placed under another
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

  // One link is enough while Fair is the only sub-department; when there are
  // more, the first is still the right place to land.
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
      canSetRank={seesMoney}
    />
  )
}
