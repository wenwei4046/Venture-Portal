import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth'
import { revenuePath } from '@/lib/revenue'
import { titleCanRecruit } from '@/lib/commission/titles'
import { rankLabelOf, rankPayLabelOf } from '@/lib/commission/ranks'
import HierarchyTabs from './_components/HierarchyTabs'
import type { OrgDepartment, OrgPerson, OrgRank } from './_components/OrgChart'
import type { OrgDirector } from './_components/org-chart-types'
import { loadTeam } from '../../_components/config/load'
import type { TeamData } from '../../_components/config/types'
import { listSubDepartments, type SubDepartment } from '../../_lib/sub-departments'

interface PageProps {
  params: Promise<{ sub: string }>
}

/**
 * Staff Hierarchy shows the active sibling sub-departments on one canvas.
 * Each region keeps its own scheme, memberships and ladder; the Team tab
 * remains scoped to the route. Its chart region and table share one
 * `loadTeam` read, so both show the same titles, uplines and ranks.
 *
 * MEMBERSHIPS (user, 2026-09-10): a sub-department is a world of its own —
 * its own tree, and its own title and rank per person. The HOME
 * sub-department (the department's oldest) is the company chart itself: its
 * line is `reports_to`, its titles are the company titles, and the database
 * keeps its memberships in step with the roster. Every other sub-department
 * is drawn and edited here, member by member.
 *
 * REVENUE DIRECTOR (user, 2026-09-11): a department head stands above every
 * tree of the sub-departments they direct — a row of cards under the frame's
 * header with a line down to each team leader and each standalone member.
 * A reporting line only: a head holds no rank and no override reaches them,
 * so they are never among the `people` and the Team tab lists them apart.
 */
export default async function StaffHierarchyPage({ params }: PageProps) {
  await requirePermission('revenue')
  const { sub } = await params
  // The same authenticated/RLS-filtered list used by the sidebar. Only
  // siblings of this route belong on its overview, not another department.
  const subDepartments = await listSubDepartments()
  const subDept = subDepartments.find(department => department.slug === sub)
  if (!subDept) notFound()

  // Nothing can be charted against a sub-department with no scheme: a rank is
  // a scheme's row, and a position points at one.
  if (!subDept.schemeId) return <NoScheme subDept={subDept} />

  const siblings = subDepartments.filter(
    (department): department is SubDepartment & { schemeId: string } =>
      department.departmentId === subDept.departmentId && department.schemeId !== null,
  )
  const currentTeam = loadTeam(subDept.schemeId, { isHome: subDept.isHome, subDepartmentId: subDept.id })
  const [team, departments] = await Promise.all([
    currentTeam,
    Promise.all(siblings.map(async (department): Promise<OrgDepartment> => {
      const membership = department.id === subDept.id
        ? await currentTeam
        : await loadTeam(department.schemeId, { isHome: department.isHome, subDepartmentId: department.id })
      return {
        id: department.id,
        name: department.name,
        slug: department.slug,
        schemeId: department.schemeId,
        isHome: department.isHome,
        ...chartData(membership),
      }
    })),
  ])

  return (
    <HierarchyTabs
      subDept={{ name: subDept.name, slug: subDept.slug, isHome: subDept.isHome }}
      schemeId={subDept.schemeId}
      departments={departments}
      team={team}
    />
  )
}

/** Convert one scheme at a time: staff IDs may recur with different roles. */
function chartData(team: TeamData): { people: OrgPerson[]; ranks: OrgRank[]; directors: OrgDirector[] } {
  // A rank is its rate, lettered from the top of the Rank tab's catalogue —
  // the rung's label is a trigger-kept copy of its rank's (comm_rank_defs,
  // 2026-09-05) — so the chart and the table say "Rank B · 8%", never the
  // title with the rate stapled on.
  const shortLabel = new Map(team.ranks.map(r => [r.id, r.label]))
  const payLabels = new Map(team.ranks.map(r => [r.id, rankPayLabelOf(r)]))
  const packageRanks = new Set(team.ranks.filter(r => Number(r.group_incentive_amount ?? 0) > 0).map(r => r.id))

  const ranks: OrgRank[] = team.ranks.map(r => ({
    id: r.id,
    rankKey: r.rank_key,
    titleId: r.title_id,
    label: rankLabelOf(r),
    productRate: Number(r.product_rate),
    canRecruit: r.can_recruit,
    sortOrder: r.sort_order,
  }))
  const rankById = new Map(ranks.map(r => [r.id, r]))

  const people: OrgPerson[] = team.people.map(p => {
    const rank = p.rank_id ? rankById.get(p.rank_id) : undefined
    return {
      staffId: p.staff_id,
      name: p.employee_name,
      code: p.employee_code,
      titleName: p.title_name,
      titleId: p.title_id,
      levelRank: p.title_level_rank,
      levelName: p.title_level_name,
      uplineStaffId: p.upline_staff_id,
      rankId: p.rank_id,
      rankLabel: rank ? (shortLabel.get(rank.id) ?? null) : null,
      productRate: rank?.productRate ?? null,
      rankPayLabel: rank ? payLabels.get(rank.id) : undefined,
      isGroupPackage: rank ? packageRanks.has(rank.id) : false,
      // Who may hold downlines follows the TITLE held here (user 2026-09-03):
      // a Team Assistant back on 5% for a month keeps their team. A title the
      // ladder does not carry cannot lead anyone here.
      canRecruit: titleCanRecruit(ranks, p.title_id) ?? false,
      rateMode: p.rate_mode,
      placedSince: p.placed_since,
      directLineCount: p.direct_line_count,
      directLineLimit: p.direct_line_limit,
      expansionEarnedAt: p.expansion_earned_at,
      expansionSourcePeriod: p.expansion_source_period,
    }
  })

  // The heads the sub-department reports to, drawn above every tree. Reporting
  // only — they hold no rank and are never among `people`.
  const directors: OrgDirector[] = team.directors.map(d => ({
    staffId: d.staff_id,
    name: d.employee_name,
    code: d.employee_code,
    titleName: d.title_name,
  }))

  return { people, ranks, directors }
}

function NoScheme({ subDept }: { subDept: SubDepartment }) {
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REVENUE · {subDept.name.toUpperCase()}
          </div>
          <h1 className="page-title">Staff Hierarchy</h1>
        </div>
      </div>

      <div className="py-16 text-center border border-hairline rounded-card bg-surface">
        <p className="font-serif text-2xl text-ink mb-3">{subDept.name} has no scheme yet.</p>
        <p className="font-serif italic text-muted text-sm max-w-md mx-auto">
          A rank belongs to a scheme and a position points at a rank, so there is nothing to place
          anyone into. Set the scheme up under{' '}
          <Link href={revenuePath(subDept.slug, 'rules')} className="text-accent hover:underline">
            Rules
          </Link>{' '}
          first.
        </p>
      </div>
    </div>
  )
}
