'use client'

import { useLayoutEffect, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { useFinView } from './fin-view'

// A row's page that belongs to another list than its path says (2026-10-10,
// the user's Claude Design handoff; user: 做完他): a receipt opens at
// /payments/<id> but is Receipt's. The page names its list with <NavOwner>,
// and on the Finance view the phone's top bar, the tab bar and the sidebar
// read it — for that path only, and only while the page is on screen.

export interface NavOwnerInfo {
  /** The list the page belongs to, as the nav links it: '/receipts'. */
  href: string
  /** What the phone's top bar calls the page: 'Receipt'. */
  title: string
}

type Claim = NavOwnerInfo & { path: string }

let claim: Claim | null = null
const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}
function set(next: Claim | null) {
  claim = next
  for (const l of listeners) l()
}

/** The list that owns this path, when its page has named one. */
export function useNavOwner(pathname: string | null | undefined): NavOwnerInfo | null {
  const c = useSyncExternalStore(
    subscribe,
    () => claim,
    () => null,
  )
  return c && pathname && c.path === pathname ? c : null
}

/** On a row's page: the list it belongs to. Renders nothing. */
export function NavOwner({ href, title }: NavOwnerInfo) {
  const pathname = usePathname()
  const fin = useFinView()
  // Before paint, so the bars never show the path's own list first.
  useLayoutEffect(() => {
    if (!fin || !pathname) return
    const mine: Claim = { path: pathname, href, title }
    set(mine)
    return () => {
      if (claim === mine) set(null)
    }
  }, [fin, pathname, href, title])
  return null
}
