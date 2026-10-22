// Marketing's own view (2026-10-23 — the user, handing over the Claude Design handoff "HOUZS Marketing Module Setup",
// `.design/marketing`: "这个东西是当做 Marketing Department 的 marketing view（一个单独的 department view）… 这里其实就是
// 他们的 desktop view"): the department's own shell — a sidebar of emoji tiles (My Space, Calendar, Subsidiaries,
// Projects, Library and the manager tools), a white top bar (the crumb, the search, New Project, the bell) and the
// page on a white card — over the account's own power.
//
// Who wears it:
// - the Principal's Marketing lens (`vp-view-as` = marketing — the account as `role: 'marketing'`, lib/view-as.ts);
// - an account wholly on its title's template (`staff`) whose tabs open Marketing's view — *Marketing · Manager* and
//   *Marketing · Staff* (mig 20261023214000). Decided by its tabs, never by a kind of its own (permissions.md › THE
//   DEPT MANAGER IS GONE: "A department's own view, when it is built, starts from a template and its cells").
// HR's and Finance's accounts and the Principal's own view keep their shells. On a phone the portal keeps its phone
// shell: the view is the computer's (the user: a Marketing phone app comes later).

import type { UserRole } from '@/types'

export type MarketingViewer = { role: UserRole | string; tabs?: readonly string[] } | null | undefined

/** Marketing's shell for this viewer: the Principal's lens, or a template that opens Marketing's view. */
export function isMarketingView(viewer: MarketingViewer): boolean {
  if (!viewer) return false
  if (viewer.role === 'marketing') return true
  return viewer.role === 'staff' && (viewer.tabs ?? []).includes('mkt.overview.view')
}

/** `collapsed` while Marketing's sidebar is folded to its 64px rail (the H tile, or «, toggles it). */
export const MKT_NAV_COOKIE = 'vp-mkt-nav'

/** The Appearance panel's choices — font size, face and density (lib/marketing/look.ts). */
export const MKT_LOOK_COOKIE = 'vp-mkt-look'
