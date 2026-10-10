/**
 * The Revenue app's pages, each the tab of People › Permissions › Revenue app
 * that stands for it (2026-10-11, the user: the app hides a page its holder's
 * ticks leave out — "勾掉 Arena，手机 app 就不显示").
 *
 * - A page shows unless its View box was unticked for them.
 * - A page that sends shows, but sends nothing, once its Create box was:
 *   - the Quote prices no quote (its products can still be looked at);
 *   - Requests sends no claim;
 *   - Waiting list & replacements sends neither of its two — the handoff's
 *     templates give that Create to Team Leaders and Team Assistants only.
 *
 * Only what somebody unticked ever closes (`closedBoxes`, lib/page-tabs.ts):
 * an account whose ticks are still worked out from its cells sees the app as
 * before. The CRM's two tabs and the Product List's need nothing here — their
 * cells are theirs alone, so an unticked box takes the cell, and the app
 * already asks it. Pure: the layout works it out, the app draws by it.
 */

export const APP_PAGE_TABS = {
  today: 'rev.today',
  insight: 'rev.insight',
  quote: 'rev.quote',
  arena: 'rev.arena',
  income: 'rev.income',
  requests: 'rev.requests',
  track: 'rev.track',
  team: 'rev.team',
} as const

export type AppPage = keyof typeof APP_PAGE_TABS

/** What their unticked boxes close in the app. */
export interface AppClosed {
  /** Pages whose View was unticked: neither shown nor reachable. */
  pages: AppPage[]
  /** Pages whose Create was unticked: shown, sending nothing. */
  sends: AppPage[]
}

export const NOTHING_CLOSED: AppClosed = { pages: [], sends: [] }

const PAGES = Object.entries(APP_PAGE_TABS) as Array<[AppPage, string]>

export function appClosed(closed: readonly string[] | undefined): AppClosed {
  if (!closed?.length) return NOTHING_CLOSED
  const shut = new Set(closed)
  return {
    pages: PAGES.filter(([, tab]) => shut.has(`${tab}.view`)).map(([page]) => page),
    sends: PAGES.filter(([, tab]) => shut.has(`${tab}.create`)).map(([page]) => page),
  }
}

/** The page whose Create a request of this kind is sent under: a claim is Requests', a waiting list or replacement its own page's. */
export function requestPageOf(kind: string): 'requests' | 'track' {
  return kind === 'claim' ? 'requests' : 'track'
}

/** Why a send is refused, said to whoever tried (a stale page or a hand-made request — the button is not drawn). */
export const SEND_REFUSED: Readonly<Record<'quote' | 'requests' | 'track', string>> = {
  quote: 'Pricing a quote is not open to your account.',
  requests: 'Sending a claim is not open to your account.',
  track: 'Sending a waiting list or a replacement is not open to your account.',
}
