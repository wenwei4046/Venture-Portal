import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { revenuePath } from '@/lib/revenue'
import { ladderBreaks, type Rung } from '@/lib/ladder'
import { listSubDepartments } from '../../revenue/_lib/sub-departments'
import TeamOrgChart, { type ChartPerson } from './_components/TeamOrgChart'
import LevelsBoard, { type BoardTitle } from './_components/LevelsBoard'

/**
 * Hierarchy: the ladder, and the company org chart drawn under it.
 *
 * LEVELS, at the top of the page — the user's placing (2026-09-05; the board
 * lived on the Roles page from 2026-09-03 until then). One scale for the whole
 * company, every title pinned to a rung. It is the rule the chart obeys and
 * the thing a promotion climbs, and it moved here because the chart is where
 * the rule is felt — a refused drop, a red line — so the two are read
 * together.
 *
 * THE CHART — every department on one canvas. Two lines are drawn and only
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
 * Since 2026-09-03 the chart also obeys the ladder: nobody can be dropped
 * under somebody whose title stands lower than theirs. The ladder is a rule
 * about titles — how high, never where — so moving people between departments
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
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> PEOPLE · HIERARCHY
          </div>
          <h1 className="page-title">Hierarchy</h1>
          <p className="font-serif italic text-graphite text-base mt-3 max-w-2xl">
            The ladder first: which title stands on which level, one scale for
            the whole company. Then the chart — drag somebody onto their
            manager, or draw a line from a manager down to them. Nobody can be
            put under a title the ladder ranks below theirs. The dashed lines
            are the Revenue Department&apos;s commission uplines — shown here,
            changed on their own page.
          </p>
        </div>
      </div>

      <LevelsBoard rungs={rungs} titles={boardTitles} breaks={breaks} />

      <section id="chart" className="mb-12 scroll-mt-6">
        <div className="sect-head">
          <h2>Org chart</h2>
          <span className="rule" aria-hidden />
          <span className="count">
            {people.length} {people.length === 1 ? 'PERSON' : 'PEOPLE'}
          </span>
        </div>

        {people.length === 0 ? (
          <div className="py-16 text-center border border-hairline rounded-card bg-surface">
            <p className="font-serif text-2xl text-ink mb-3">Nobody to chart yet.</p>
            <p className="font-serif italic text-muted text-sm max-w-md mx-auto">
              Add people under People → People Management first.
            </p>
          </div>
        ) : (
          <TeamOrgChart people={people} commissionHref={commissionHref} />
        )}
      </section>
    </div>
  )
}
