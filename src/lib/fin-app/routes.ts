// The Finance phone app's addresses (2026-10-15, the Finance revamp v2's phone —
// README §1 of `.design/fin-r2/handoff`, `Finance Mobile App.dc.html`, M01–M18).
// Five tabs — Overview · Daily · Fund · Report · Profile — the three middle
// ones each a row of top tabs over hubs in the design's order; every other
// page of Finance's sidebar is a screen of its own, pushed over its tab.
// Which hubs and pages show is the sidebar's answer (fin-nav.ts — the same
// rows, the same `visible` and tabs), never a list of its own.

/** `approvals` is the Principal's own view's tab (2026-10-17), between the Overview and Daily. */
export type AppTab = 'home' | 'approvals' | 'daily' | 'fund' | 'report' | 'profile'

/** The Approvals tab's root — the queue as the Principal's own tab (2026-10-17). */
export const APPROVALS_TAB_HREF = '/fin-app/approvals'

export type HubKey = 'payments' | 'receipts' | 'invoices' | 'billing' | 'fund-out' | 'fund-in' | 'pnl' | 'cf' | 'debtor' | 'loan' | 'bs'

/** Each tab's hubs, left to right — the prototype's GROUPS. */
export const TAB_HUBS: Readonly<Record<'daily' | 'fund' | 'report', readonly HubKey[]>> = {
  daily: ['payments', 'receipts', 'invoices', 'billing'],
  fund: ['fund-out', 'fund-in'],
  report: ['pnl', 'cf', 'debtor', 'loan', 'bs'],
}

/** A hub's top tab (13px caps): the prototype's TOP_T. */
export const TOP_LABEL: Readonly<Record<HubKey, string>> = {
  payments: 'Payment',
  receipts: 'Receive',
  invoices: 'Invoice',
  billing: 'Billing',
  'fund-out': 'Fund out',
  'fund-in': 'Fund in',
  pnl: 'P&L',
  cf: 'Cash flow',
  debtor: 'Debtor aging',
  loan: 'Loan aging',
  bs: 'Balance sheet',
}

/** A hub's name where a pushed screen says where it came back to (‹ Payments): the prototype's HUB_T. */
export const HUB_TITLE: Readonly<Record<HubKey, string>> = {
  payments: 'Payments',
  receipts: 'Receive',
  invoices: 'Invoices',
  billing: 'Billing Allocator',
  'fund-out': 'Fund OUT',
  'fund-in': 'Fund IN',
  pnl: 'P&L',
  cf: 'Cash Flow',
  debtor: 'Debtor Aging',
  loan: 'Loan Aging',
  bs: 'Balance Sheet',
}

export const HUB_HREF: Readonly<Record<HubKey, string>> = {
  payments: '/fin-app/daily/payments',
  receipts: '/fin-app/daily/receipts',
  invoices: '/fin-app/daily/invoices',
  billing: '/fin-app/daily/billing',
  'fund-out': '/fin-app/fund/out',
  'fund-in': '/fin-app/fund/in',
  pnl: '/fin-app/report/pnl',
  cf: '/fin-app/report/cf',
  debtor: '/fin-app/report/debtor',
  loan: '/fin-app/report/loan',
  bs: '/fin-app/report/bs',
}

/** The sidebar row (fin-nav.ts's key) each hub stands for — a department reader's single-month P&L is the P&L hub too. */
const HUB_OF_ROW: Readonly<Record<string, HubKey>> = {
  payments: 'payments',
  receipts: 'receipts',
  invoices: 'invoices',
  billing: 'billing',
  'fund-out': 'fund-out',
  'fund-in': 'fund-in',
  pnl: 'pnl',
  'pnl-month': 'pnl',
  cf: 'cf',
  debtor: 'debtor',
  loan: 'loan',
  bs: 'bs',
}

export function hubOfRow(key: string): HubKey | null {
  return HUB_OF_ROW[key] ?? null
}

/**
 * Where a sidebar row (or a Profile › Admin row) opens in the app: its hub, else a screen of its own —
 * Approvals the Principal's own tab, for a reader who has it (`approvalsTab`).
 */
export function appHref(key: string, opts: { approvalsTab?: boolean } = {}): string {
  const hub = HUB_OF_ROW[key]
  if (hub) return HUB_HREF[hub]
  if (key === 'overview') return '/fin-app'
  if (key === 'approvals' && opts.approvalsTab) return APPROVALS_TAB_HREF
  return `/fin-app/page/${encodeURIComponent(key)}`
}

/** The hubs of a tab this reader opens, in the design's order (`rows`: the sidebar keys they see). */
export function tabHubs(tab: 'daily' | 'fund' | 'report', rows: ReadonlySet<string>): HubKey[] {
  return TAB_HUBS[tab].filter((h) => Object.entries(HUB_OF_ROW).some(([row, hub]) => hub === h && rows.has(row)))
}

/** The hub an address is on, if any. */
export function hubOf(pathname: string): HubKey | null {
  for (const [hub, href] of Object.entries(HUB_HREF) as Array<[HubKey, string]>) {
    if (pathname === href || pathname.startsWith(href + '/')) return hub
  }
  return null
}

/**
 * The tab an address belongs to. A page of its own (`/fin-app/page/…`) is
 * pushed over whatever tab it was opened from, with the tab bar away, so it
 * names none of its own: the Overview's.
 */
export function tabOf(pathname: string): AppTab {
  if (pathname === APPROVALS_TAB_HREF || pathname.startsWith(APPROVALS_TAB_HREF + '/')) return 'approvals'
  if (pathname.startsWith('/fin-app/daily')) return 'daily'
  if (pathname.startsWith('/fin-app/fund')) return 'fund'
  if (pathname.startsWith('/fin-app/report')) return 'report'
  if (pathname.startsWith('/fin-app/profile')) return 'profile'
  return 'home'
}
