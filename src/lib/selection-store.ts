// Row selections that survive a drill-down, but not a tab switch.
//
// Checkbox selection used to live only in the list component's useState, so
// opening one row's detail page unmounted the list and every tick was lost —
// user 2026-09-01: "我勾选了 5-6 个东西,其中一个看不太懂就点进去看详情,看完
// 出来之前勾选过的全都要重新勾一遍". The selection now lives here, in module
// scope, so it outlives that unmount and the list reads it back on remount.
//
// Lifetime rule, in the user's own words ("如果我跳去其他的 tab,那些选中的
// 东西就不见了,这个是正常的"): a scope keeps its selection while you drill
// INTO detail pages, and drops it the moment you land on another nav
// destination. PortalFrame calls dropSelectionsForPath() on every pathname
// change — see components/layout/PortalFrame.tsx.
//
// Module scope rather than sessionStorage, deliberately: it dies with the tab
// (a reload starts clean, which is the safer default for an approve-money
// queue), and it never lets the client render a value the server did not, so
// hydration stays honest. Nothing writes to it during render, so the copy that
// exists on the server during SSR stays empty for the process' whole life.

const selections = new Map<string, Set<string>>()

/** The ids stored for `scope` — a copy, safe to hold as state. */
export function readSelection(scope: string): Set<string> {
  const stored = selections.get(scope)
  return stored ? new Set(stored) : new Set()
}

/** Replace what `scope` has stored. An empty set drops the entry entirely. */
export function writeSelection(scope: string, ids: ReadonlySet<string>): void {
  if (ids.size === 0) selections.delete(scope)
  else selections.set(scope, new Set(ids))
}

/**
 * Expire every stored selection the reader has navigated away from.
 *
 * `navRoots` is the set of nav destinations (see nav-config's navRootPaths).
 * Landing on one that is not the scope itself is a tab switch → forget.
 * Anything else — `/approvals/<id>`, and any detail page reached from there,
 * such as the `/fund-out/<loanId>` link on an approval — is a drill-down, so
 * the selection is still waiting when the reader comes back.
 */
export function dropSelectionsForPath(
  pathname: string,
  navRoots: ReadonlySet<string>,
): void {
  for (const scope of [...selections.keys()]) {
    const insideScope = pathname === scope || pathname.startsWith(scope + '/')
    if (!insideScope && navRoots.has(pathname)) selections.delete(scope)
  }
}

/** Test seam — no production caller. */
export function resetSelections(): void {
  selections.clear()
}
