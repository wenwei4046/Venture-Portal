/**
 * Warming a page before it is clicked (2026-09-26).
 *
 * A sidebar link the pointer RESTS on is about to be clicked, so the page is
 * rendered now — a full prefetch, `router.prefetch(href)` — and the click that
 * follows lands on a page that is already there: no skeleton, no wait. This is
 * the Houzs ERP's hover prefetch (its lib/prefetch-routes.ts), except the ERP
 * only warms code and fetches data after the click; here the server renders the
 * page, data included, so the warm is worth the whole wait.
 *
 * Deliberately narrow, because the portal has been burnt before: on-mount
 * `router.prefetch()` of every sidebar route was ~24 full server renders per
 * hard load, and buttons queued behind them (2026-09-09). So:
 *   - one link at a time, and only after the pointer has settled on it
 *     (INTENT_MS) — sweeping down the rail warms nothing;
 *   - not while the collapsed rail is still sliding open under the pointer;
 *   - never on a data-saver or 2g link;
 *   - never a page that WRITES THE AUDIT LOG while it renders. A full prefetch
 *     reaches the server as an ordinary render, so warming /team/people would
 *     record that somebody viewed the staff directory when they only moved the
 *     mouse over it. AUDITED_ROUTES lists them; `nav-warm.test.ts` fails when a
 *     page calls log_data_access and is not on it.
 * What is warmed is reused for `experimental.staleTimes.static` (30 s,
 * next.config.ts) and thrown away by any Server Action that revalidates.
 */

import { markWarmed } from './route-freshen'

interface Prefetcher {
  prefetch: (href: string) => void
}

/** How long the pointer must rest on a link before it counts as intent. */
export const INTENT_MS = 120

/** The collapsed sidebar takes ~200 ms to slide open (Sidebar.tsx). A link
 *  that happens to be under the pointer while it does is not a choice. */
export const RAIL_SETTLE_MS = 260

/** Pages whose render records an access_log row. Never warmed. */
export const AUDITED_ROUTES: readonly RegExp[] = [
  /^\/team\/people$/,
  /^\/director-salary\/[^/]+$/,
  /^\/director-salary\/[^/]+\/print$/,
]

export function isAuditedRoute(pathname: string): boolean {
  return AUDITED_ROUTES.some((route) => route.test(pathname))
}

interface NetworkInformation {
  saveData?: boolean
  effectiveType?: string
}

function connectionAllows(): boolean {
  if (typeof navigator === 'undefined') return false
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection
  if (!connection) return true
  if (connection.saveData) return false
  return connection.effectiveType !== '2g' && connection.effectiveType !== 'slow-2g'
}

/** Whether `href` may be warmed from the page at `currentHref`. */
export function canWarm(href: string, currentHref: string): boolean {
  let target: URL
  let current: URL
  try {
    current = new URL(currentHref)
    target = new URL(href, current)
  } catch {
    return false
  }
  if (target.origin !== current.origin) return false
  if (target.pathname === current.pathname && target.search === current.search) return false
  if (isAuditedRoute(target.pathname)) return false
  return connectionAllows()
}

/** Render `href` now so a click on it is instant. */
export function warmRoute(router: Prefetcher, href: string): void {
  if (typeof window === 'undefined' || !canWarm(href, window.location.href)) return
  try {
    // router.prefetch defaults to a FULL prefetch in the App Router — the page
    // itself, not just its loading boundary.
    router.prefetch(href)
    // How old the warmed page is, for the refresh behind a click on it (lib/route-freshen.ts).
    markWarmed(new URL(href, window.location.href).pathname, performance.now())
  } catch {
    // A warm is a guess; it must never surface an error.
  }
}

let intentTimer: ReturnType<typeof setTimeout> | null = null
let railEnteredAt = 0

/** The pointer has just entered the sidebar rail. */
export function railEntered(now = Date.now()): void {
  railEnteredAt = now
}

/** The pointer rests on a link: warm it once it has stayed long enough. One
 *  shared timer, so a sweep across the rail resolves to the link it stops on. */
export function warmOnIntent(router: Prefetcher, href: string, now = Date.now()): void {
  cancelWarmIntent()
  const settling = Math.max(0, railEnteredAt + RAIL_SETTLE_MS - now)
  intentTimer = setTimeout(() => {
    intentTimer = null
    warmRoute(router, href)
  }, Math.max(INTENT_MS, settling))
}

export function cancelWarmIntent(): void {
  if (intentTimer !== null) {
    clearTimeout(intentTimer)
    intentTimer = null
  }
}

// ── the pages somebody opens most, warmed while the portal sits idle (2026-10-08) ──
//
// User: 切换到另外一个 tab 都非常的慢. Hover only warms the link the pointer rests on;
// the first click of a session on anything else still waited for the server
// (0.3–1.1 s on prod). So the browser remembers which pages this person opens,
// and when the portal has sat idle for a moment it renders their usual few —
// one at a time, the most-visited first, never an audited page, never on a
// data-saver connection — and keeps them five minutes
// (`experimental.staleTimes.static`). A click on one is then instant, and the
// page refreshes itself behind the click (components/layout/RouteFreshener.tsx).
// Bounded on purpose: 2026-09-09's warm-everything-on-load was ~24 full renders
// per hard load and every button queued behind them.

const VISITS_KEY = 'vp-nav-visits'
/** How many pages are kept in the tally. */
const VISITS_KEPT = 30
/** At most this many pages are warmed per idle spell. */
export const IDLE_WARM_MAX = 3
/** A page is somebody's usual once they have opened it this many times. */
export const IDLE_WARM_MIN_VISITS = 2
/** Quiet this long (no navigation) before anything is warmed. */
export const IDLE_WARM_AFTER_MS = 2000
/** Between two warms, so they never arrive at the server together. */
export const IDLE_WARM_GAP_MS = 700

interface Storage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function tally(storage: Storage | null): Record<string, number> {
  if (!storage) return {}
  try {
    const parsed = JSON.parse(storage.getItem(VISITS_KEY) ?? '{}') as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, n]) => typeof n === 'number' && Number.isFinite(n))) as Record<string, number>
  } catch {
    return {}
  }
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** One more visit to `path` (a pathname, no query), on this browser only. */
export function recordVisit(path: string, storage: Storage | null = browserStorage()): void {
  if (!storage || !path.startsWith('/')) return
  const counts = tally(storage)
  counts[path] = (counts[path] ?? 0) + 1
  const kept = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, VISITS_KEPT)
  try {
    storage.setItem(VISITS_KEY, JSON.stringify(Object.fromEntries(kept)))
  } catch {
    // Private mode or a full disk: nothing is warmed beyond the hovered link.
  }
}

/**
 * The pages to warm now: links this person can see in the nav (`hrefs`), the
 * most-visited first, opened at least IDLE_WARM_MIN_VISITS times, never the
 * page on screen or an audited one.
 */
export function usualPages(hrefs: readonly string[], currentPath: string, storage: Storage | null = browserStorage(), max = IDLE_WARM_MAX): string[] {
  const counts = tally(storage)
  const seen = new Set<string>()
  const candidates: { href: string; n: number }[] = []
  for (const href of hrefs) {
    const path = href.split('?')[0]
    if (seen.has(href) || path === currentPath || isAuditedRoute(path)) continue
    seen.add(href)
    const n = counts[path] ?? 0
    if (n >= IDLE_WARM_MIN_VISITS) candidates.push({ href, n })
  }
  return candidates.sort((a, b) => b.n - a.n).slice(0, max).map((c) => c.href)
}

/**
 * Warm `hrefs` one after another, IDLE_WARM_GAP_MS apart, after IDLE_WARM_AFTER_MS
 * of quiet. Returns a cancel for when the person moves on first.
 */
export function warmWhenIdle(router: Prefetcher, hrefs: readonly string[]): () => void {
  const timers: ReturnType<typeof setTimeout>[] = []
  if (!connectionAllows()) return () => {}
  hrefs.forEach((href, i) => {
    timers.push(setTimeout(() => warmRoute(router, href), IDLE_WARM_AFTER_MS + i * IDLE_WARM_GAP_MS))
  })
  return () => timers.forEach(clearTimeout)
}
