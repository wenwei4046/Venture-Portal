/**
 * Is the portal waiting on a page? (2026-09-26)
 *
 * The App Router has no navigation events, so this store is fed by the two
 * places that do know something, and the top progress line (NavProgress) is
 * drawn from it and from nothing else:
 *
 *   start — src/instrumentation-client.ts. Next calls `onRouterTransitionStart`
 *           the moment any client navigation begins: a <Link> click,
 *           router.push / replace, back and forward. NavProgress answers with
 *           an optimistic "pending" set inside the SAME transition as the
 *           router's own update, so it lasts exactly until Next commits the
 *           navigation — the mechanism Next's own `useLinkStatus` uses.
 *   body  — RouteSkeleton, which every loading.tsx renders while a page's
 *           content is on its way, counts itself in and out here. The router
 *           has committed by then (the address bar already moved); the page is
 *           still streaming.
 *
 * Waiting = a navigation not yet committed, or a route skeleton on screen.
 */

type Listener = () => void

const startListeners = new Set<Listener>()
const skeletonListeners = new Set<Listener>()
let skeletons = 0

/** A client navigation has begun. Called from instrumentation-client. */
export function navigationStarted(): void {
  for (const listener of startListeners) {
    try {
      listener()
    } catch {
      // Feedback must never be the thing that breaks a navigation.
    }
  }
}

export function onNavigationStart(listener: Listener): () => void {
  startListeners.add(listener)
  return () => {
    startListeners.delete(listener)
  }
}

/** A route skeleton is on screen. Pair every call with skeletonHidden(). */
export function skeletonShown(): void {
  skeletons += 1
  notifySkeletons()
}

export function skeletonHidden(): void {
  if (skeletons > 0) skeletons -= 1
  notifySkeletons()
}

export function visibleSkeletons(): number {
  return skeletons
}

export function subscribeSkeletons(listener: Listener): () => void {
  skeletonListeners.add(listener)
  return () => {
    skeletonListeners.delete(listener)
  }
}

function notifySkeletons(): void {
  for (const listener of skeletonListeners) listener()
}
