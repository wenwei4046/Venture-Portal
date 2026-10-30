/**
 * Where the month's commission workbench is standing (2026-09-27): which cut
 * of the month, whose ledger, which of their tables, and how that table is
 * searched, filtered and sorted — all of it in the URL.
 *
 * It lived in React state, so the browser's Back from a bill (opened from
 * ANTHONY's ledger) re-mounted the month on its first view, the list of
 * salespeople — "I clicked into Anthony, then his order, pressed Back and it
 * went straight to the home page" (user 2026-09-27). In the URL, every step
 * is a history entry: Back from the bill is Anthony again, on the same table,
 * and a ledger is a link somebody can send.
 *
 *   ?view=kpi|open|deposit|exhibition  the cut of the month (absent: Total Sales Orders);
 *                                  `venue` — the tab's name until 2026-10-03, Sales by
 *                                  venue — still opens Sales exhibition
 *   ?view=changes|claims|requests  the month's review panels (2026-09-30): Drops &
 *                                  upsells, Possible double claims — and (2026-10-21)
 *                                  the salespeople's share requests
 *   ?view=sellers                  (2026-10-31) Whose sale: the bills held because their
 *                                  paper is on another salesperson's order
 *   ?person=<staff id>             whose ledger is open (the cut is then theirs)
 *   ?orders=overriding|deposit     which of their tables (absent: Personal)
 *   ?q= ?brand= ?sort=             the table's search, brand and order
 *
 * Not `?tab=`: on the same page that key is the Payroll & source tools' rail
 * (`MonthBreakdownTabs`), and every key here leaves the ones it does not own
 * alone.
 */

export type WorkbenchTab = 'sales' | 'kpi' | 'open' | 'deposit' | 'exhibition' | 'changes' | 'claims' | 'sellers' | 'requests'
export type LedgerView = 'personal' | 'overriding' | 'deposit'
export type LedgerSort = 'date_asc' | 'date_desc' | 'commission_desc'

export interface WorkbenchLocation {
  tab: WorkbenchTab
  personId: string | null
  view: LedgerView
  query: string
  brand: string
  sort: LedgerSort
}

const TABS: readonly WorkbenchTab[] = ['sales', 'kpi', 'open', 'deposit', 'exhibition', 'changes', 'claims', 'sellers', 'requests']
const VIEWS: readonly LedgerView[] = ['personal', 'overriding', 'deposit']
const SORTS: readonly LedgerSort[] = ['date_asc', 'date_desc', 'commission_desc']

/** The keys the workbench owns. Anything else in the query is somebody else's. */
export const WORKBENCH_KEYS = ['view', 'person', 'orders', 'q', 'brand', 'sort'] as const

function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

/** Where a query string puts the workbench. A value it does not know is the default. */
export function readWorkbenchLocation(params: { get(key: string): string | null }): WorkbenchLocation {
  const personId = params.get('person')?.trim() || null
  // Sales by venue became Sales exhibition (2026-10-03); a link saved before keeps working.
  const view = params.get('view') === 'venue' ? 'exhibition' : params.get('view')
  return {
    // A ledger is always opened from Total Sales Orders' list of people.
    tab: personId ? 'sales' : oneOf(view, TABS, 'sales'),
    personId,
    view: personId ? oneOf(params.get('orders'), VIEWS, 'personal') : 'personal',
    query: params.get('q') ?? '',
    brand: params.get('brand') ?? '',
    sort: oneOf(params.get('sort'), SORTS, 'date_asc'),
  }
}

/**
 * The query string for `to`, written over `current` — the keys the workbench
 * does not own are kept as they were. Defaults are left out, so the month's
 * first view is the bare path. Returns '' when nothing is left, which the
 * caller turns into the pathname (an empty URL would keep the old query).
 */
export function workbenchSearch(current: string | URLSearchParams, to: WorkbenchLocation): string {
  const params = new URLSearchParams(current)
  for (const key of WORKBENCH_KEYS) params.delete(key)
  if (to.personId) {
    params.set('person', to.personId)
    if (to.view !== 'personal') params.set('orders', to.view)
  } else if (to.tab !== 'sales') {
    params.set('view', to.tab)
  }
  if (to.query) params.set('q', to.query)
  if (to.brand) params.set('brand', to.brand)
  if (to.sort !== 'date_asc') params.set('sort', to.sort)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/** Whether two locations show the same table — the ones that are worth a history entry. */
export function sameWorkbenchView(a: WorkbenchLocation, b: WorkbenchLocation): boolean {
  return a.tab === b.tab && a.personId === b.personId && a.view === b.view
}

/**
 * A bill's page, carrying the way back to the ledger it was opened from
 * (`?from=`). The bill's own month decides the path — a bill carried in from
 * August is August's page — while `from` is wherever the reader was standing.
 */
export function billHref(sub: string, orderPeriod: string, orderId: string, from: string | null): string {
  const path = `/revenue/${sub}/${orderPeriod}/orders/${orderId}`
  return from ? `${path}?from=${encodeURIComponent(from)}` : path
}

export interface WorkbenchReturn extends WorkbenchLocation {
  /** The month page to go back to, rebuilt from what was checked — never the raw value. */
  href: string
  /** The month the workbench was showing, `YYYY-MM-01`. */
  period: string
}

const ORIGIN = 'https://portal.invalid'
const MONTH_PAGE = /^\/revenue\/([^/]+)\/(\d{4}-\d{2}-01)$/

/**
 * Reads a bill page's `?from=`. Only a month page of the SAME sub-department
 * is honoured — never another site (`//x`, `/\x`, `https://x`, `javascript:`),
 * never another page — so the link it becomes can only ever lead back into
 * the workbench. The query comes along (normalised): it is what makes the page
 * the salesperson's rather than the month's first view.
 */
export function parseWorkbenchReturn(from: string | null | undefined, sub: string): WorkbenchReturn | null {
  if (!from || from.length > 2048 || !from.startsWith('/')) return null
  let url: URL
  try {
    url = new URL(from, ORIGIN)
  } catch {
    return null
  }
  if (url.origin !== ORIGIN) return null
  const match = MONTH_PAGE.exec(url.pathname)
  if (!match || match[1] !== sub) return null
  const qs = url.searchParams.toString()
  return {
    ...readWorkbenchLocation(url.searchParams),
    href: `${url.pathname}${qs ? `?${qs}` : ''}`,
    period: match[2],
  }
}
