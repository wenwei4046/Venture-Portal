import Link from 'next/link'
import { requirePermission } from '@/lib/auth'
import { revenuePath } from '@/lib/revenue'
import { titleCanRecruit } from '@/lib/commission/titles'
import { rankLabelOf } from '@/lib/commission/ranks'
import HierarchyTabs from './_components/HierarchyTabs'
import type { OrgPerson, OrgRank } from './_components/OrgChart'
import { loadTeam } from '../../_components/config/load'
import { requireSubDepartment, type SubDepartment } from '../../_lib/sub-departments'

interface PageProps {
  params: Promise<{ sub: string }>
}

/**
 * Staff Hierarchy: who overrides whom, for one sub-department — as a chart
 * and, since 2026-09-05, as a table (the Team tab, which used to be Rules IX).
 * Both are one `loadTeam` read, so a move on the chart is what the table
 * shows and a rank set on the table is what the chart draws.
 *
 * Deliberately separate from `hr_staff_costs.department_id` and from any
 * app-role hierarchy — this exists only to answer "who is under who, at what
 * rank, in which month", and it is what the override differential is computed
 * from.
 */
export default async function StaffHierarchyPage({ params }: PageProps) {
  await requirePermission('revenue')
  const { sub } = await params
  const subDept = await requireSubDepartment(sub)

  // Nothing can be charted against a sub-department with no scheme: a rank is
  // a scheme's row, and a position points at one.
  if (!subDept.schemeId) return <NoScheme subDept={subDept} />

  const team = await loadTeam(subDept.schemeId)

  // A rank is its rate, lettered from the top of the Rank tab's catalogue —
  // the rung's label is a trigger-kept copy of its rank's (comm_rank_defs,
  // 2026-09-05) — so the chart and the table say "Rank B · 8%", never the
  // title with the rate stapled on.
  const shortLabel = new Map(team.ranks.map(r => [r.id, r.label]))

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
      uplineStaffId: p.upline_staff_id,
      reportsTo: p.reports_to,
      rankId: p.rank_id,
      rankLabel: rank ? (shortLabel.get(rank.id) ?? null) : null,
      productRate: rank?.productRate ?? null,
      // Who may hold downlines follows the TITLE they hold (user 2026-09-03);
      // only somebody with no title yet is judged by the rank they sit at.
      canRecruit: titleCanRecruit(ranks, p.title_id) ?? rank?.canRecruit ?? false,
      rateMode: p.rate_mode,
      placedSince: p.placed_since,
    }
  })

  return (
    <HierarchyTabs
      subDept={{ name: subDept.name, slug: subDept.slug }}
      schemeId={subDept.schemeId}
      chart={{ people, ranks }}
      team={team}
    />
  )
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
