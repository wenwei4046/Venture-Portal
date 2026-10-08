'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { navigationTimes } from '@/lib/nav-progress'
import { isAuditedRoute } from '@/lib/nav-warm'
import { cameFromMemory, forgetReads, markRead, recentRscFetches, staleInMemory, watchRscFetches } from '@/lib/route-freshen'

/**
 * How long after a page lands the check runs: long enough for the RSC fetch of
 * a page the server rendered to be on record, short enough that the refresh
 * starts before anybody has begun reading.
 */
export const FRESHEN_DELAY_MS = 120

const now = () => performance.now()

/**
 * Stale-while-revalidate for the portal's pages (2026-10-08, lib/route-freshen.ts):
 * a page answered from the router's memory is shown at once, and read again
 * behind itself when what memory held is more than a minute old. Never a page
 * whose render writes the audit log (a refresh is a render: it would log a
 * visit nobody made). Renders nothing.
 */
export default function RouteFreshener() {
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const search = useSearchParams()?.toString() ?? ''
  const first = useRef(true)

  useEffect(() => { watchRscFetches() }, [])

  useEffect(() => {
    // The hard load was rendered by the server for this very request.
    if (first.current) { first.current = false; markRead(pathname, now()); return }
    const timer = window.setTimeout(() => {
      const { startedAt, skeletonAt } = navigationTimes()
      const at = now()
      if (!cameFromMemory({ startedAt, skeletonAt, fetches: recentRscFetches(), path: pathname })) { markRead(pathname, at); return }
      if (isAuditedRoute(pathname) || !staleInMemory(pathname, at)) return
      // The refresh throws the router's whole memory away (Next 15): only this page is on record after it.
      forgetReads(pathname, at)
      router.refresh()
    }, FRESHEN_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [pathname, search, router])

  return null
}
