import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { revenuePath } from '@/lib/revenue'
import { listSubDepartments } from '../../revenue/_lib/sub-departments'
import TeamOrgChart, { type ChartPerson } from './_components/TeamOrgChart'

/**
 * The company org chart — every department on one canvas.
 *
 * Two lines are drawn and only one of them is editable here:
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
 * Since 2026-09-03 the chart also obeys the ladder (Roles → Levels): nobody
 * can be dropped under somebody whose title stands lower than theirs. The
 * ladder is a rule about titles, set on the Roles page; this page only reads
 * it. Moving people between departments stays a gesture here — the rule says
 * how high, not where.
 */
export default async function TeamHierarchyPage() {
  await requirePermission('team')
  const supabase = await createClient()

  const [{ data: staffRows }, { data: positions }, { data: levels }, subDepts] =
    await Promise.all([
      supabase
        .from('hr_staff_costs')
        .select(
          'id, employee_name, employee_code, reports_to, designation, titles(name, level_id), departments(name)',
        )
        .eq('status', 'active')
        .order('employee_name'),
      supabase
        .from('comm_hierarchy')
        .select('staff_id, upline_staff_id')
        .is('effective_to', null),
      supabase.from('title_levels').select('id, rank, name'),
      listSubDepartments(),
    ])

  const commUpline = new Map<string, string | null>(
    ((positions ?? []) as Array<{ staff_id: string; upline_staff_id: string | null }>).map(p => [
      p.staff_id,
      p.upline_staff_id,
    ]),
  )

  const rungs = new Map(
    ((levels ?? []) as Array<{ id: string; rank: number; name: string }>).map(l => [l.id, l]),
  )

  const people: ChartPerson[] = ((staffRows ?? []) as unknown as Array<{
    id: string
    employee_name: string
    employee_code: string | null
    reports_to: string | null
    designation: string | null
    titles: { name: string; level_id: string | null } | null
    departments: { name: string } | null
  }>).map(s => {
    const rung = s.titles?.level_id ? (rungs.get(s.titles.level_id) ?? null) : null
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
            Drag somebody onto their manager, or draw a line from a manager down
            to them. Nobody can be put under a title the ladder ranks below
            theirs. The dashed lines are the Revenue Department&apos;s
            commission uplines — shown here, changed on their own page.
          </p>
        </div>
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
    </div>
  )
}
