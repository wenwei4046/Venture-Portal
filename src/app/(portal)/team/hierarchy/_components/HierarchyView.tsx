'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { SlidingTabs, type TabItem } from '@/components/motion/SlidingTabs'
import type { Rung } from '@/lib/ladder'
import TeamOrgChart, { type ChartPerson } from './TeamOrgChart'
import LevelsBoard, { type BoardTitle } from './LevelsBoard'
import type { RankOption, SalesPerson } from './HierarchyPanel'
import RevenueOrgChart from './RevenueOrgChart'
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
 * priority, and priority here means width and position, not a louder heading —
 * everything else moved to the margin rather than in front.
 *
 * Three columns on the chart tab, stacked on a phone:
 *
 *   Staff hierarchy      the canvas, `flex-1`. Drag, or draw a line down.
 *   Commission hierarchy the Revenue department's own tree, 380px. The same
 *                        people, a different parent — who earns the override.
 *                        Read-only; it is moved on the Revenue page.
 *   Rules                the ladder, foldable.
 *
 * The second column was a flat list in the panel until the user rejected it:
 * a list can say a hierarchy exists but not what shape it is, and the shape is
 * the question you have when two hierarchies cover the same people. Both
 * charts share one `focused`, so clicking somebody on either lights them up
 * and centres them on the other — which is what makes the pair readable as one
 * fact about a person rather than two drawings.
 *
 * Three views, one rail:
 *
 *   Org chart  the canvas. Drag, or draw a line from a manager down.
 *   Table      the same two facts as rows, which is the shape bulk work wants.
 *              Eleven people to rank is eleven drags on a canvas.
 *   Levels     the ladder board, still editable in full. Reading it no longer
 *              needs this tab — the panel carries it — but changing it does.
 *
 * The panel rides the first two and not Levels: the board IS the rules, and
 * showing the rules beside themselves would be a mirror, not a reference. The
 * Revenue chart rides the chart tab alone — the table is for bulk edits, and a
 * second canvas beside it is noise, not context.
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
  salespeople,
  ranksByScheme,
  canSetRank,
}: {
  people: ChartPerson[]
  commissionHref: string | null
  rungs: Rung[]
  titles: BoardTitle[]
  /** Reporting lines the ladder, as it stands, would refuse. */
  breaks: Array<{ id: string; managerId: string }>
  salespeople: SalesPerson[]
  ranksByScheme: Record<string, RankOption[]>
  canSetRank: boolean
}) {
  const searchParams = useSearchParams()
  const tab = hierarchyTab(searchParams.get('tab'))
  // Who is lit up, held here because three things now react to it: both
  // charts and the panel's list of broken lines. Clicking a person on either
  // chart centres them on the other — the same person, drawn twice.
  const [focused, setFocused] = useState<string | null>(null)

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
                The chart as rows, in ladder order. Changing who somebody reports to moves their
                commission upline with them; the rank is what a month pays from.
              </>
            ) : (
              <>
                Drag somebody onto their manager, or draw a line from a manager down to them.
                Nobody can be put under a title the ladder ranks below theirs. The dashed lines are
                the commission uplines — and since a move now writes both, they follow.
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
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-stretch lg:items-start">
          {/* min-w-0 or the canvas — which is as wide as the tree is — sets the
              row's width and pushes the panel off the page. */}
          <div className="min-w-0 flex-1">
            {tab === 'table' ? (
              <StaffTable
                people={people}
                salespeople={salespeople}
                ranksByScheme={ranksByScheme}
                canSetRank={canSetRank}
              />
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
                  ranksByScheme={ranksByScheme}
                  salespeople={salespeople}
                />
              </>
            )}
          </div>
          {tab === 'chart' ? (
            /* One narrow rail beside the canvas, never a share of it: the user
               asked for the graph to come first, and first means width. An
               earlier cut gave this column 380px AND put the ladder in a third
               column of 320px, which left the staff canvas 360px of a 1150px
               window — four cards visible out of fifty-one.

               The ladder used to sit under this chart. Removed 2026-09-07 on
               the user's instruction: the rules already have a home on the
               Levels tab and on /revenue/[sub]/rules, and restating them
               beside the chart bought nothing the legend does not. Broken
               lines still show — red on the canvas, counted in the legend. */
            <div className="w-full lg:w-[340px] shrink-0 lg:sticky lg:top-4">
              <div className="sect-head">
                <h2>Commission hierarchy</h2>
                <span className="rule" aria-hidden />
                <span className="count">REVENUE DEPT</span>
              </div>
              <RevenueOrgChart
                salespeople={salespeople}
                focused={focused}
                onFocus={setFocused}
                commissionHref={commissionHref}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
