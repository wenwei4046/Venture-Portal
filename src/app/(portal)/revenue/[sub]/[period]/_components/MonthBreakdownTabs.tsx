'use client'

import { useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'
import { SlidingTabs, type TabItem } from '@/components/motion/SlidingTabs'

export type MonthTab = 'open-bill' | 'upsales'

/**
 * What HR keeps beside the month's bills, on one rail under the saved run.
 *
 * It began as three cuts of the bills stacked down the page (user 2026-09-17:
 * "不要全部放在同一个页面一直 scroll down"); on 2026-09-26 *Sales by venue*
 * moved up into the workbench's tabs and *Sales by person* went, because the
 * workbench's own table already is that. What stays is what the picks cost —
 * read from the saved run's lines — and the upsales and drops HR records.
 *
 * The rail IS the section heading — its labels are the headings those sections
 * carried, so putting a `.sect-head` above them as well would title the same
 * thing twice.
 *
 * Every panel is rendered on the server and handed here as a node: switching
 * is a `pushState` and a re-render, never a round trip, and `?tab=` still
 * opens the month on the view somebody meant to send.
 */
export default function MonthBreakdownTabs({
  openBill,
  upsales,
  counts,
}: {
  /** Null when this month pays no Open Bill bonus — IR has none. */
  openBill: ReactNode | null
  /** Absent on a page that does not offer upsales. */
  upsales?: ReactNode
  counts: { openBill: number; upsales?: number }
}) {
  const searchParams = useSearchParams()

  const tabs: TabItem[] = [
    ...(openBill ? [{ key: 'open-bill', label: 'Open Bill', count: counts.openBill }] : []),
    ...(upsales ? [{ key: 'upsales', label: 'Upsales & drops', count: counts.upsales ?? 0 }] : []),
  ]
  if (tabs.length === 0) return null

  const asked = searchParams.get('tab')
  const first = tabs[0].key as MonthTab
  const tab: MonthTab = tabs.some(t => t.key === asked) ? (asked as MonthTab) : first

  function goTo(key: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (key === first) params.delete('tab')
    else params.set('tab', key)
    const qs = params.toString()
    window.history.pushState(null, '', qs ? `?${qs}` : window.location.pathname)
  }

  return (
    <div>
      <SlidingTabs items={tabs} active={tab} onTabChange={goTo} />
      {tab === 'open-bill' ? openBill : upsales}
    </div>
  )
}
