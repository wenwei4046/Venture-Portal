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
