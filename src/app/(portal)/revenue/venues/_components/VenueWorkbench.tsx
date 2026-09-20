'use client'

import { useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { SlidingTabs, type TabItem } from '@/components/motion/SlidingTabs'
import { withFairs, type Organiser } from '@/lib/organisers'
import {
  groupByVenue,
  monthLabel,
  organiserTotals,
  registerMonths,
  registerSummary,
  type VenueRegisterRow,
} from '@/lib/venue-register'
import type { Fair, FairGap } from '@/lib/fair-calendar'
import FairCalendarSection from './FairCalendarSection'
import OrganiserSection from './OrganiserSection'
import VenueTable from './VenueTable'

/**
 * The register, and the month it is being read for.
 *
 * Both tables narrow together. Picking September answers "who ran each of
 * September's fairs, and what did each organiser take" — which is the job the
 * user described: the ERP delivers a month, and the organiser is filled in
 * against it. *All months* is the register itself: every venue, every fair.
 *
 * The month lives in `?month=`, pushed with the browser's own history rather
 * than navigated: every row is already here, so re-rendering the server page
 * to hide some of them would be a round trip for nothing. Next syncs
 * `useSearchParams` off `pushState`, so the URL stays shareable either way.
 */
export default function VenueWorkbench({
  register,
  organisers,
  slugs,
  fairs,
  gaps,
}: {
  register: VenueRegisterRow[]
  organisers: Organiser[]
  /** sub-department id → slug, for the link into a month. */
  slugs: Record<string, string>
  /** Every fair on record — when it ran, and what it sold. */
  fairs: Fair[]
  /** Bills belonging to no fair, by place and the month their ERP date gives them. */
  gaps: FairGap[]
}) {
  const searchParams = useSearchParams()
  const months = useMemo(() => registerMonths(register), [register])
  const asked = searchParams.get('month')
  const month = asked && months.includes(asked) ? asked : null

  const tabs: TabItem[] = [
    { key: 'all', label: 'All months', count: months.length },
    ...months.map(m => ({ key: m, label: monthLabel(m) })),
  ]

  function goTo(key: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (key === 'all') params.delete('month')
    else params.set('month', key)
    const qs = params.toString()
    window.history.pushState(null, '', qs ? `?${qs}` : window.location.pathname)
  }

  const shown = useMemo(
    () => (month ? register.filter(r => r.periodMonth === month) : register),
    [register, month],
  )
  const venues = useMemo(() => groupByVenue(register, month), [register, month])
  const summary = useMemo(() => registerSummary(register, month), [register, month])
  // Every place, whatever month is showing: the merge dropdown must offer the
  // venue this spelling really is even when that venue had no fair this month.
  const places = useMemo(() => groupByVenue(register), [register])
  const withRuns = useMemo(
    () => withFairs(organisers, organiserTotals(shown)),
    [organisers, shown],
  )
  // The calendar narrows with everything else. A fair is filed under the month
  // its bills COUNT in, and a gap under the month its ERP dates give it — so
  // picking September shows both September's fairs and the September-dated
  // bills that may well belong to an August one.
  const shownFairs = useMemo(
    () => (month ? fairs.filter(f => f.periodMonth === month) : fairs),
    [fairs, month],
  )
  const shownGaps = useMemo(
    () => (month ? gaps.filter(g => g.periodMonth === month) : gaps),
    [gaps, month],
  )

  return (
    <div>
      {months.length > 1 ? (
        <SlidingTabs items={tabs} active={month ?? 'all'} onTabChange={goTo} variant="text" />
      ) : null}

      <OrganiserSection organisers={withRuns} month={month} />

      <FairCalendarSection
        fairs={shownFairs}
        gaps={shownGaps}
        places={places}
        organisers={organisers}
      />

      <VenueTable
        venues={venues}
        places={places}
        organisers={organisers}
        summary={summary}
        month={month}
        slugs={slugs}
      />
    </div>
  )
}
