'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { HUB_HREF, TOP_LABEL, tabHubs, type HubKey } from '@/lib/fin-app/routes'
import type { TopTab } from './AppScreen'
import { rememberHub, useFrame } from './FinAppFrame'
import { setIntent } from './nav'

/**
 * A hub's top tabs — its tab's hubs this reader's sidebar shows, in the
 * design's order — and its sideways swipe (README › Motion: the next hub plays
 * in from the right, the one before from the left). The tab remembers the hub
 * it was left on (`rememberHub`).
 */
export function useHubTabs(tab: 'daily' | 'fund' | 'report', hub: HubKey): { topTabs: TopTab[]; swipe: (way: 'next' | 'prev') => void } {
  const router = useRouter()
  const { rows } = useFrame()
  useEffect(() => rememberHub(tab, hub), [tab, hub])
  const hubs = tabHubs(tab, rows)
  const topTabs = hubs.map((h) => ({
    key: h,
    label: TOP_LABEL[h],
    href: HUB_HREF[h],
    current: h === hub,
    onPress: () => setIntent(hubs.indexOf(h) > hubs.indexOf(hub) ? 'push' : 'pop'),
  }))
  const swipe = (way: 'next' | 'prev') => {
    const to = hubs[hubs.indexOf(hub) + (way === 'next' ? 1 : -1)]
    if (!to) return
    setIntent(way === 'next' ? 'push' : 'pop')
    router.push(HUB_HREF[to])
  }
  return { topTabs, swipe }
}
