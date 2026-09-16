'use client'

import { useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'
import { SlidingTabs, type TabItem } from '@/components/motion/SlidingTabs'

export type MonthTab = 'venue' | 'person' | 'open-bill'

/**
 * The three ways to cut the month, on one rail.
 *
 * They used to be sections stacked down the page, which meant reading the
 * whole of Sales by venue to reach Sales by person and nothing at all to
 * reach the picks (user 2026-09-17: "不要全部放在同一个页面一直 scroll
 * down"). They are three answers to three different questions about the same
 * set of bills, so only one is ever being read.
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
  venue,
  person,
  openBill,
  counts,
}: {
  venue: ReactNode
  person: ReactNode
  /** Null when the scheme pays no Open Bill bonus — IR has none. */
  openBill: ReactNode | null
  counts: { venue: number; person: number; openBill: number }
}) {
  const searchParams = useSearchParams()
  const asked = searchParams.get('tab')
  const tab: MonthTab =
    asked === 'person' ? 'person' : asked === 'open-bill' && openBill ? 'open-bill' : 'venue'

  const tabs: TabItem[] = [
    { key: 'venue', label: 'Sales by venue', count: counts.venue },
    { key: 'person', label: 'Sales by person', count: counts.person },
    ...(openBill ? [{ key: 'open-bill', label: 'Open Bill', count: counts.openBill }] : []),
  ]

  function goTo(key: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (key === 'venue') params.delete('tab')
    else params.set('tab', key)
    const qs = params.toString()
    window.history.pushState(null, '', qs ? `?${qs}` : window.location.pathname)
  }

  return (
    <div>
      <SlidingTabs items={tabs} active={tab} onTabChange={goTo} />
      {tab === 'venue' ? venue : tab === 'person' ? person : openBill}
    </div>
  )
}
