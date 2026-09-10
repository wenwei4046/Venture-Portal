'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { SlidingTabs, type TabItem } from '@/components/motion/SlidingTabs'
import type { Rung } from '@/lib/ladder'
import TeamOrgChart, { ALL_DEPARTMENTS, type ChartPerson } from './TeamOrgChart'
import LevelsBoard, { type BoardTitle } from './LevelsBoard'
import StaffTable from './StaffTable'

export type HierarchyTab = 'chart' | 'table' | 'levels'

/** The view a `?tab=` value names. Anything else is the chart. */
export function hierarchyTab(param: string | null | undefined): HierarchyTab {
  return param === 'table' || param === 'levels' ? param : 'chart'
}

/**
 * Hierarchy — the graph, and the two ways of looking at what governs it.
 *
 * The chart used to be one of two tabs and shared its width with nothing.
 * Since 2026-09-07 it is the page. The user's phrasing was that the graph takes
 * priority, and priority here means width and position, not a louder heading.
 *
 * It now has the whole width, which is the second half of one decision. The
 * canvas used to share the row with the Revenue department's commission tree,
 * drawn read-only in a 340px rail. That rail is gone (user, 2026-09-08) — not
 * as clutter, but because the fact it drew was not reliably true: the rank a
 * position carries is not what a month pays, since somebody who misses their
 * monthly quota earns at a different rate. A card reading "Rank B · 8%" was
 * therefore right only in the months quota was hit, and there was no honest
 * caption to swap in, because the real figure belongs to a RUN and not to a
 * person. The tree is drawn and edited on `/revenue/[sub]/hierarchy`, where a
 * period is in scope.
 *
 * Finding somebody replaced it. Clicking a card used to centre that person on
 * the other chart, which is the only thing the pair of them made easy; the
 * canvas now carries a name search that does it directly — type "lucas", and
 * the chart scrolls to Lucas and lights him up, crossing the department filter
 * to get there if it has to.
 *
 * Three views:
 *
 *   Org chart  the canvas. Drag, or draw a line from a manager down.
 *   Table      the same facts as rows, which is the shape bulk work wants.
 *   Levels     the ladder board, still editable in full.
 *
 * The tab is `?tab=`, pushed with the browser's own history so Next syncs
 * `useSearchParams` without a round trip and Back returns to the last view.
 */
export default function HierarchyView({
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
  breaks: Array<{ id: string; managerId: string }>
}) {
  const searchParams = useSearchParams()
  const tab = hierarchyTab(searchParams.get('tab'))
  // Who is lit up. Held here rather than in the canvas because it survives a
  // switch to the table and back, so somebody found by name is still found
  // after a detour.
  const [focused, setFocused] = useState<string | null>(null)
  // The department chips. Owned here so the choice survives the same detour —
  // and so the search can widen it when the person somebody typed is standing
  // outside the department currently in focus.
  const [focusDept, setFocusDept] = useState<string>(ALL_DEPARTMENTS)

  const tabs: TabItem[] = [
    { key: 'chart', label: 'Org chart' },
    { key: 'table', label: 'Table', count: people.length },
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
                Which title stands on which level — one scale for the whole company. The chart
                obeys it, and a promotion climbs it.
              </>
            ) : tab === 'table' ? (
              <>
                The chart as rows, in ladder order. Who somebody reports to is the one line —
                inside Revenue it is also who earns the override on their sales.
              </>
            ) : (
              <>
                Drag somebody onto their manager, or draw a line from a manager down to them.
                Nobody can be put under a title the ladder ranks below theirs, and inside Revenue
                only under a title that may lead. Search a name to find where somebody sits.
              </>
            )}
          </p>
        </div>
      </div>

      <SlidingTabs items={tabs} active={tab} onTabChange={goTo} variant="control" />

      {tab === 'levels' ? (
        <LevelsBoard rungs={rungs} titles={titles} breaks={breaks.length} />
      ) : people.length === 0 ? (
        <div className="py-16 text-center border border-hairline rounded-card bg-surface">
          <p className="font-serif text-2xl text-ink mb-3">Nobody to chart yet.</p>
          <p className="font-serif italic text-muted text-sm max-w-md mx-auto">
            Add people under People → People Management first.
          </p>
        </div>
      ) : (
        /* min-w-0 or the canvas — which is as wide as the tree is — sets the
           width of the row it sits in and pushes past the page. */
        <div className="min-w-0">
          {tab === 'table' ? (
            <StaffTable people={people} />
          ) : (
            <>
              <div className="sect-head">
                <h2>Staff hierarchy</h2>
                <span className="rule" aria-hidden />
                <span className="count">{people.length} PEOPLE · REPORTS TO</span>
              </div>
              <TeamOrgChart
                people={people}
                commissionHref={commissionHref}
                focused={focused}
                onFocus={setFocused}
                focusDept={focusDept}
                onFocusDept={setFocusDept}
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}
