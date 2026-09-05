'use client'

import { useSearchParams } from 'next/navigation'
import { SlidingTabs, type TabItem } from '@/components/motion/SlidingTabs'
import type { Rung } from '@/lib/ladder'
import TeamOrgChart, { type ChartPerson } from './TeamOrgChart'
import LevelsBoard, { type BoardTitle } from './LevelsBoard'

export type HierarchyTab = 'chart' | 'levels'

/** The tab a `?tab=` value names. Anything else is the chart. */
export function hierarchyTab(param: string | null | undefined): HierarchyTab {
  return param === 'levels' ? 'levels' : 'chart'
}

/**
 * Hierarchy's two tabs, side by side on the header's rule — the org chart,
 * and the Levels board that was on the Roles page until 2026-09-05. The user
 * wanted them across ("一个、两个、三个打横着去走"), not one above the other.
 *
 * They are one rule seen from two sides: the board says how high each title
 * stands, the chart is where that rule is felt — a refused drop, a red line.
 * So they share a page, but not a scroll.
 *
 * The tab is `?tab=levels`, pushed with the browser's own history so Next
 * syncs `useSearchParams` without a round trip and Back returns to the other
 * tab. The chart is the page's own name, so it is the tab with no parameter.
 */
export default function HierarchyTabs({
  people,
  commissionHref,
  rungs,
  titles,
  breaks,
}: {
  people: ChartPerson[]
  commissionHref: string | null
  rungs: Rung[]
  titles: BoardTitle[]
  /** Reporting lines the ladder, as it stands, would refuse. */
  breaks: number
}) {
  const searchParams = useSearchParams()
  const tab = hierarchyTab(searchParams.get('tab'))

  const tabs: TabItem[] = [
    { key: 'chart', label: 'Org chart' },
    { key: 'levels', label: 'Levels' },
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
            <em>I.</em> PEOPLE · HIERARCHY
          </div>
          <h1 className="page-title">Hierarchy</h1>
          <p className="font-serif italic text-graphite text-base mt-3 max-w-2xl">
            {tab === 'levels' ? (
              <>
                Which title stands on which level — one scale for the whole
                company. The chart obeys it, and a promotion climbs it.
              </>
            ) : (
              <>
                Drag somebody onto their manager, or draw a line from a manager
                down to them. Nobody can be put under a title the ladder ranks
                below theirs. The dashed lines are the Revenue Department&apos;s
                commission uplines — shown here, changed on their own page.
              </>
            )}
          </p>
        </div>
      </div>

      <SlidingTabs items={tabs} active={tab} onTabChange={goTo} variant="control" />

      {tab === 'levels' ? (
        <LevelsBoard rungs={rungs} titles={titles} breaks={breaks} />
      ) : people.length === 0 ? (
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
