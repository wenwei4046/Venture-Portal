/**
 * Whether the page before this one in the tab's history is a given URL
 * (2026-09-27) — what lets a "← back to …" link step BACK when that is where
 * the reader came from, instead of stacking the same page on top again.
 *
 * Read through the Navigation API (`navigation.entries()`), which Chromium has
 * shipped since 2022 and the other engines since 2025. Where it is missing the
 * answer is simply "not known", and the link navigates forward as any link
 * does — never a Back into somewhere unexpected.
 */

interface HistoryEntryLike {
  url: string | null
  index: number
}

interface NavigationLike {
  currentEntry: HistoryEntryLike | null
  entries(): HistoryEntryLike[]
}

/** Same page, same query — the query's order does not matter, its values do. */
export function sameLocation(a: string, b: string, base: string): boolean {
  let x: URL
  let y: URL
  try {
    x = new URL(a, base)
    y = new URL(b, base)
  } catch {
    return false
  }
  if (x.origin !== y.origin || x.pathname !== y.pathname) return false
  const pairs = (url: URL) => [...url.searchParams].map(([key, value]) => `${key}=${value}`).sort().join('&')
  return pairs(x) === pairs(y)
}

/** The URL of the entry before the current one, when the browser will say. */
export function previousEntryUrl(win: Window = window): string | null {
  const navigation = (win as Window & { navigation?: NavigationLike }).navigation
  const current = navigation?.currentEntry
  if (!navigation || !current || current.index < 1 || typeof navigation.entries !== 'function') return null
  return navigation.entries()[current.index - 1]?.url ?? null
}

/** True only when the browser confirms the previous entry is `href`. */
export function previousEntryIs(href: string, win: Window = window): boolean {
  const previous = previousEntryUrl(win)
  return previous !== null && sameLocation(previous, href, win.location.href)
}
