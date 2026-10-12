import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePermission, requirePage } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { revenuePath } from '@/lib/revenue'
import { titleCanRecruit } from '@/lib/commission/titles'
import { rankLabelOf, rankPayLabelOf } from '@/lib/commission/ranks'
import SalesGroupsView from './_components/SalesGroupsView'
import { canDo } from '@/lib/permission-actions'
import { loadSubDepartmentRequests } from '../../_lib/sub-department-requests'
import { loadReplacementForm, loadWaitingForm } from '../../_lib/waiting-form'
import { loadSubDepartmentCapacity } from '../../_lib/capacity'
import { PageHead } from '@/components/hrv/kit'
import SubDeptSwitcher from '../../_components/SubDeptSwitcher'
import { loadSwitcherData, type SwitcherData } from '../../_lib/switcher'
import type { OrgDepartment, OrgPerson, OrgRank } from './_components/OrgChart'
import type { OrgDirector } from './_components/org-chart-types'
import { loadTeam } from '../../_components/config/load'
import type { TeamData } from '../../_components/config/types'
import { listSubDepartments, type SubDepartment } from '../../_lib/sub-departments'
import { loadMembershipDestinations } from '../../_lib/membership-destinations'
import { loadEmployeeDepartmentDestinations } from '../../_lib/employee-destinations'

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
 * its own tree, and its own title and rank per person. Somebody's HOME
 * sub-department is the company chart itself: its line is `reports_to`, its
 * title is the company title, and the database keeps that one membership in
 * step with the roster. Every other membership is drawn and edited here.
 *
 * WHOSE home (2026-09-20): a person's own, not the department's. One chart
 * can therefore hold both kinds of row at once — people based here, and
 * people who work here as well as somewhere else — so `basedHere` is asked
 * per name and never per sub-department.
 *
 * REVENUE DIRECTOR (user, 2026-09-11): a department head stands above every
 * tree of the sub-departments they direct — a row of cards under the frame's
 * header with a line down to each team leader and each standalone member.
 * A reporting line only: a head holds no rank and no override reaches them,
 * so they are never among the `people` and the Team tab lists them apart.
 */
export default async function StaffHierarchyPage({ params }: PageProps) {
  await requirePage('/revenue/[sub]/hierarchy')
  const user = await requirePermission('revenue')
  const canManageEmployment = can(user, 'team')
  // Employment dates follow Malaysia's calendar, regardless of server timezone.
  const employmentToday = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { sub } = await params
  // The same authenticated/RLS-filtered list used by the sidebar. Only
  // siblings of this route belong on its overview, not another department.
  const subDepartments = await listSubDepartments()
  const subDept = subDepartments.find(department => department.slug === sub)
  if (!subDept) notFound()

  // Nothing can be charted against a sub-department with no scheme: a rank is
  // a scheme's row, and a position points at one.
  const switcher = await loadSwitcherData(user, subDept)
  const head = <SalesGroupsHead name={subDept.name} switcher={switcher} />
  if (!subDept.schemeId) return <NoScheme subDept={subDept} head={head} />

  const siblings = subDepartments.filter(
    (department): department is SubDepartment & { schemeId: string } =>
      department.departmentId === subDept.departmentId && department.schemeId !== null,
  )
  const currentTeam = loadTeam(subDept.schemeId, { subDepartmentId: subDept.id })
  // The waiting list and replacements are the member back office's to read:
  // only for whoever manages member requests, and then with the page — the
  // waiting list's form and the places left (Transfer waits while it is full)
  // with them.
  const seesRequests = can(user, 'member_requests_manage')
  const [team, departments, membershipDestinations, employeeDepartments, requests, waitingForm, replacementForm, capacity] = await Promise.all([
    currentTeam,
    Promise.all(siblings.map(async (department): Promise<OrgDepartment> => {
      const membership = department.id === subDept.id
        ? await currentTeam
        : await loadTeam(department.schemeId, { subDepartmentId: department.id })
      return {
        id: department.id,
        name: department.name,
        slug: department.slug,
        schemeId: department.schemeId,
        isHome: department.isHome,
        ...chartData(membership),
      }
    })),
    loadMembershipDestinations(subDepartments),
    canManageEmployment ? loadEmployeeDepartmentDestinations() : Promise.resolve([]),
    seesRequests ? loadSubDepartmentRequests(subDept.id) : Promise.resolve(null),
    seesRequests ? loadWaitingForm() : Promise.resolve(null),
    seesRequests ? loadReplacementForm() : Promise.resolve(null),
    seesRequests ? loadSubDepartmentCapacity(subDept.id) : Promise.resolve(null),
  ])

  return (
    <SalesGroupsView
      subDept={{ name: subDept.name, slug: subDept.slug, isHome: subDept.isHome }}
      schemeId={subDept.schemeId}
      departments={departments}
      team={team}
      membershipDestinations={membershipDestinations}
      employeeDepartments={employeeDepartments}
      canManageEmployment={canManageEmployment}
      employmentToday={employmentToday}
      canEdit={canDo(user, 'revenue', 'edit')}
      requests={requests}
      waitingForm={waitingForm}
      replacementForm={replacementForm}
      capacity={capacity?.ok ? capacity.data : null}
      canTransfer={canDo(user, 'team', 'create')}
      canAddToWaiting={seesRequests && canDo(user, 'member', 'manage')}
      head={head}
    />
  )
}

/** Sales Groups' head (2026-10-10, was Staff Hierarchy): no rule — its tabs sit under it. */
function SalesGroupsHead({ name, switcher }: { name: string; switcher: SwitcherData }) {
  return (
    <PageHead
      bare
      eyebrow={`Revenue · ${name}`}
      title="Sales Groups"
      right={<SubDeptSwitcher data={switcher} view="sg" />}
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

  const basedHere = new Set(team.homeStaffIds)
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
      basedHere: basedHere.has(p.staff_id),
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

function NoScheme({ subDept, head }: { subDept: SubDepartment; head: React.ReactNode }) {
  return (
    <div>
      {head}

      <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center mt-5">
        <p className="text-md font-bold mb-2">{subDept.name} has no scheme yet.</p>
        <p className="text-sm max-w-md mx-auto">
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
