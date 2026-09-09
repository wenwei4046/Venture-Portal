'use client'

import { useSearchParams } from 'next/navigation'
import { SlidingTabs, type TabItem } from '@/components/motion/SlidingTabs'
import OrgChart, { type OrgPerson, type OrgRank } from './OrgChart'
import TeamTable from './TeamTable'
import type { TeamData } from '../../../_components/config/types'

export type HierarchyTab = 'chart' | 'team'

/**
 * Staff Hierarchy's two tabs, on the header's rule: the chart, and the Team
 * table that was Rules IX until 2026-09-05 (user: "移去 staff hierarchy 那边
 * … 这个写 team"). They are two views of one position row, and the split of
 * what each may change is the point of putting them side by side:
 *
 *   chart  moves people between trees freely — drag, or draw a line;
 *   table  changes nothing but the RANK (and the rate mode that rides with
 *          it); the upline column is what the chart drew, read-only.
 *
 * The tab is `?tab=team`, pushed with the browser's own history so Next
 * syncs `useSearchParams` without a round trip.
 */
export default function HierarchyTabs({
  subDept,
  schemeId,
  chart,
  team,
}: {
  subDept: { name: string; slug: string }
  schemeId: string
  chart: { people: OrgPerson[]; ranks: OrgRank[] }
  team: TeamData
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
              <>
                Everyone on {subDept.name}: the title they hold, the rank they are paid from, and
                who they report to. Only the <em>rank</em> is set here — where somebody sits in a
                tree is moved on the chart, and this table follows it.
              </>
            ) : (
              <>
                Every card names its upline — change it there, or drag the card onto somebody.
                Cards stay where you put them; Tidy lines them up again. Every move writes a new
                dated position — a month already computed keeps the chart it was computed against.
              </>
            )}
          </p>
        </div>
      </div>

      <SlidingTabs items={tabs} active={tab} onTabChange={goTo} variant="control" />

      {tab === 'team' ? (
        <TeamTable people={team.people} ranks={team.ranks} schemeId={schemeId} />
      ) : chart.people.length === 0 ? (
        <NobodyYet />
      ) : (
        <OrgChart people={chart.people} ranks={chart.ranks} schemeId={schemeId} />
      )}
    </div>
  )
}

function NobodyYet() {
  return (
    <div className="py-16 text-center border border-hairline rounded-card bg-surface">
      <p className="font-serif text-2xl text-ink mb-3">Nobody to chart yet.</p>
      <p className="font-serif italic text-muted text-sm max-w-md mx-auto">
        Add salespeople under People Management with a commission department, then give them a
        rank on the Team tab.
      </p>
    </div>
  )
}
