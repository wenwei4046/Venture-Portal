'use client'

import { useSearchParams } from 'next/navigation'
import { SlidingTabs, type TabItem } from '@/components/motion/SlidingTabs'
import OrgChart, { type OrgDepartment } from './OrgChart'
import TeamTable from './TeamTable'
import type { TeamData } from '../../../_components/config/types'
import type { MembershipDestination } from '../../../_lib/membership-destinations'
import type { EmployeeDepartmentDestination } from '../../../_lib/employee-destinations'

export type HierarchyTab = 'chart' | 'team'

/**
 * Staff Hierarchy's two tabs, on the header's rule: the chart, and the Team
 * table that was Rules IX until 2026-09-05 (user: "移去 staff hierarchy 那边
 * … 这个写 team"). They are two views of one line, and the split of what
 * each may change is the point of putting them side by side:
 *
 *   chart  arranges independent department memberships on one canvas;
 *          targeted drops, Upline and connector edits change reporting lines;
 *   table  changes nothing but the RANK (and the rate mode that rides with
 *          it); the upline column is who they report to, read-only. Since
 *          2026-09-11 it also says who the sub-department REPORTS TO — its
 *          Revenue Director(s), a reporting line above every tree that no
 *          override climbs — and that is set there.
 *
 * The tab is `?tab=team`, pushed with the browser's own history so Next
 * syncs `useSearchParams` without a round trip.
 */
export default function HierarchyTabs({
  subDept,
  schemeId,
  team,
  departments,
  membershipDestinations,
  employeeDepartments = [],
  canManageEmployment = false,
  employmentToday = '',
  head,
}: {
  subDept: { name: string; slug: string; isHome: boolean }
  schemeId: string
  team: TeamData
  departments: OrgDepartment[]
  membershipDestinations: MembershipDestination[]
  employeeDepartments?: EmployeeDepartmentDestination[]
  canManageEmployment?: boolean
  employmentToday?: string
  /** The page's head (2026-10-10: Sales Groups, with the sub-department switcher). */
  head: React.ReactNode
}) {
  const searchParams = useSearchParams()
  const tab: HierarchyTab = searchParams.get('tab') === 'team' ? 'team' : 'chart'
  const currentDestination = membershipDestinations.find(destination => destination.schemeId === schemeId)

  const tabs: TabItem[] = [
    { key: 'chart', label: 'Chart' },
    { key: 'team', label: 'Members', count: team.people.length },
  ]

  function goTo(key: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (key === 'chart') params.delete('tab')
    else params.set('tab', key)
    const qs = params.toString()
    window.history.pushState(null, '', qs ? `?${qs}` : window.location.pathname)
  }

  return (
    <div>
      {head}

      <SlidingTabs items={tabs} active={tab} onTabChange={goTo} variant="control" />

      {tab === 'team' ? (
        <TeamTable
          people={team.people}
          ranks={team.ranks}
          titles={team.titles}
          candidates={team.candidates.filter(person => currentDestination?.eligibleStaffIds.includes(person.staff_id))}
          directors={team.directors}
          directorCandidates={team.directorCandidates}
          subDepartmentId={team.subDepartmentId}
          schemeId={schemeId}
          subDeptName={subDept.name}
          isHome={subDept.isHome}
          membershipDestinations={membershipDestinations}
        />
      ) : departments.length === 0 ? (
        <NobodyYet isHome={subDept.isHome} />
      ) : (
        <OrgChart departments={departments} membershipDestinations={membershipDestinations}
          employeeDepartments={employeeDepartments} canManageEmployment={canManageEmployment} employmentToday={employmentToday}
          initialDepartmentId={departments.find(department => department.schemeId === schemeId)?.id} />
      )}
    </div>
  )
}

function NobodyYet({ isHome }: { isHome: boolean }) {
  return (
    <div className="border border-hairline rounded-card bg-surface-2 p-6 text-center">
      <p className="text-md font-bold mb-2">Nobody to chart yet.</p>
      <p className="text-sm max-w-md mx-auto">
        {isHome
          ? 'Add salespeople under People Management with a commission department and a ladder title; they appear here with the rank their title gives.'
          : 'Add members on the Team tab — anybody in the department, with the title they hold here.'}
      </p>
    </div>
  )
}
