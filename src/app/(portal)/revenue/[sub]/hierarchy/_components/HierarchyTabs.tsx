'use client'

import { useSearchParams } from 'next/navigation'
import { SlidingTabs, type TabItem } from '@/components/motion/SlidingTabs'
import OrgChart, { type OrgDepartment } from './OrgChart'
import TeamTable from './TeamTable'
import type { TeamData } from '../../../_components/config/types'

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
}: {
  subDept: { name: string; slug: string; isHome: boolean }
  schemeId: string
  team: TeamData
  departments: OrgDepartment[]
}) {
  const searchParams = useSearchParams()
  const tab: HierarchyTab = searchParams.get('tab') === 'team' ? 'team' : 'chart'

  const tabs: TabItem[] = [
    { key: 'chart', label: 'Hierarchy' },
    { key: 'team', label: 'Team', count: team.people.length },
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
      <div className="page-head tabbed">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REVENUE · {subDept.name.toUpperCase()}
          </div>
          <h1 className="page-title">Staff Hierarchy</h1>
          <p className="font-serif italic text-graphite text-base mt-3 max-w-2xl">
            {tab === 'team' ? (
              subDept.isHome ? (
                <>
                  Who {subDept.name} reports to, then everyone on it: the title they hold, the
                  rank they are paid from, and who they report to. Only the <em>rank</em> is set
                  here — a title gives its rank on its own, and who somebody reports to is moved
                  on the chart.
                </>
              ) : (
                <>
                  Who {subDept.name} reports to, then who is in it: the title each holds{' '}
                  <em>here</em>, the rank they are paid from, and who they earn under. Titles,
                  ranks and membership are set here; who earns under whom is moved on the chart.
                  None of it touches People.
                </>
              )
            ) : (
              <>
                Explore every sub-department on one canvas. Its Revenue Director stands at the
                top of the frame, and every team leader and standalone member reports to them —
                a reporting line only, with no override. Drag a team or department border or
                heading to move it freely. Hold over a person until the transfer prompt appears
                to change upline. The Team tab edits {subDept.name}.
              </>
            )}
          </p>
        </div>
      </div>

      <SlidingTabs items={tabs} active={tab} onTabChange={goTo} variant="control" />

      {tab === 'team' ? (
        <TeamTable
          people={team.people}
          ranks={team.ranks}
          titles={team.titles}
          candidates={team.candidates}
          directors={team.directors}
          directorCandidates={team.directorCandidates}
          subDepartmentId={team.subDepartmentId}
          schemeId={schemeId}
          subDeptName={subDept.name}
          isHome={subDept.isHome}
        />
      ) : departments.length === 0 ? (
        <NobodyYet isHome={subDept.isHome} />
      ) : (
        <OrgChart departments={departments} initialDepartmentId={departments.find(department => department.schemeId === schemeId)?.id} />
      )}
    </div>
  )
}

function NobodyYet({ isHome }: { isHome: boolean }) {
  return (
    <div className="py-16 text-center border border-hairline rounded-card bg-surface">
      <p className="font-serif text-2xl text-ink mb-3">Nobody to chart yet.</p>
      <p className="font-serif italic text-muted text-sm max-w-md mx-auto">
        {isHome
          ? 'Add salespeople under People Management with a commission department and a ladder title; they appear here with the rank their title gives.'
          : 'Add members on the Team tab — anybody in the department, with the title they hold here.'}
      </p>
    </div>
  )
}
