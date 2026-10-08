/**
 * A page shown from memory is read again behind itself (2026-10-08).
 *
 * User: 切换到另外一个 tab 都非常的慢 … 我要它做到真正的快. The client router keeps
 * a visited page for `experimental.staleTimes` (next.config.ts, five minutes)
 * and shows it again without asking the server — instant, but only as fresh
 * as the moment it was read. So a page that came from memory (a revisit, a
 * warmed link, Back) and is older than FRESH_ENOUGH_MS is refreshed at once
 * in the background: `router.refresh()` keeps it on screen and swaps the
 * server's new render in, the way Facebook or Instagram show the last feed
 * and update it. A page the server has just rendered for this click is
 * already fresh and is left alone.
 *
 * Why not every time: in Next 15 `router.refresh()` throws away the router's
 * whole memory (refresh-reducer: `prefetchCache = new Map()`), so a refresh on
 * every revisit would make the next tab cold again. A page read less than a
 * minute ago is shown as it is; an older one is refreshed, and the pages the
 * person uses most are warmed again once the portal is idle (lib/nav-warm.ts).
 *
 * Telling the two apart: a navigation that went to the server either showed a
 * route skeleton (lib/nav-progress.ts counts them) or fetched the page's RSC
 * payload (`?_rsc=` on the page's own path) after it began. Neither = memory.
 */

/** A page shown from memory that was read this recently is current enough to leave alone. */
export const FRESH_ENOUGH_MS = 60_000

export interface RscFetch {
  /** The pathname the payload was for. */
  path: string
  /** performance.now() when the request began. */
  start: number
}

export interface Arrival {
  /** When the navigation began (instrumentation-client), or null on the first load. */
  startedAt: number | null
  /** When a route skeleton last came on screen. */
  skeletonAt: number | null
  /** The RSC payloads fetched recently. */
  fetches: readonly RscFetch[]
  /** The page that was arrived at. */
  path: string
}

/** Whether the page on screen came from the router's memory rather than from the server just now. */
export function cameFromMemory(arrival: Arrival): boolean {
  const { startedAt, skeletonAt, fetches, path } = arrival
  if (startedAt === null) return false // the hard load: the server rendered it for this request
  if (skeletonAt !== null && skeletonAt >= startedAt) return false // it streamed in behind a skeleton
  return !fetches.some(f => f.path === path && f.start >= startedAt - 1)
}

/** The pathname of an RSC request's URL, if it is one (`?_rsc=`). */
export function rscPath(url: string): string | null {
  try {
    const u = new URL(url, 'http://x')
    return u.searchParams.has('_rsc') ? u.pathname : null
  } catch {
    return null
  }
}

const RECENT = 40
const fetches: RscFetch[] = []
let watching = false

/**
 * Note every RSC payload the browser fetches (Resource Timing, observed — the
 * entry buffer fills up in a long session, an observer does not).
 */
export function watchRscFetches(): void {
  if (watching || typeof PerformanceObserver === 'undefined') return
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const path = rscPath(entry.name)
        if (!path) continue
        fetches.push({ path, start: entry.startTime })
        if (fetches.length > RECENT) fetches.splice(0, fetches.length - RECENT)
      }
    })
    observer.observe({ type: 'resource', buffered: true })
    watching = true
  } catch {
    // No Resource Timing: every arrival counts as from memory — a refresh too many, never a stale page.
  }
}

export function recentRscFetches(): readonly RscFetch[] {
  return fetches
}

// ── how old the page in memory is ──
// When each page was last rendered by the server for this browser: a hard load, a navigation the server
// answered, a refresh, a warm that had to fetch. Kept here, beside the fetches, because the router's own
// timestamps are not public.
const readAt = new Map<string, number>()

/** The server has just rendered `path` for this browser. */
export function markRead(path: string, at: number): void {
  readAt.set(path, at)
}

/**
 * A warm was asked for `path`: if nothing of it is on record the warm fetched it now; otherwise the warm may
 * have found it still in memory, and its record stands.
 */
export function markWarmed(path: string, at: number): void {
  if (!readAt.has(path)) readAt.set(path, at)
}

/** The router's memory was thrown away (a refresh): only what is on screen now is on record. */
export function forgetReads(keep: string, at: number): void {
  readAt.clear()
  readAt.set(keep, at)
}

/** Whether a page shown from memory should be read again: never on record, or read longer ago than FRESH_ENOUGH_MS. */
export function staleInMemory(path: string, now: number, freshFor = FRESH_ENOUGH_MS): boolean {
  const at = readAt.get(path)
  return at === undefined || now - at >= freshFor
}
