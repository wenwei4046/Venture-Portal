// Which pages sit on the white sheet (DESIGN.md › "Sheet theme", 2026-09-27).
//
// Comm Cal's month (#151 → #162) set the portal's new tone: the content on one
// white, rounded sheet inside the unchanged plaster shell, black lettering, the
// lighter orange for actions and markers, summary cards, and tables with an
// uppercase header band. The user asked for the rest of the portal to follow,
// HR's view first — the pages under HR Costing, Director Salary, Director Pool,
// Revenue and Claims (#166), then the rest of HR's sidebar: the Overview and
// the People section. PortalFrame draws the sheet for every path listed here,
// so a page's detail routes, print previews and loading skeleton land on it
// too, and the sheet stays put while one of these pages replaces another.
//
// The Overview is one route for every role — Principal, Finance, HR and a
// department manager each get their own dashboard under `/dashboard` — so all
// four moved onto the sheet together.
//
// 2026-10-07 — Finance's view followed (user: "finance 的整体 background 可以换成
// 和 principal 和 hr 一样", option A, "做 A 先"): every page Finance reads, and
// the department manager's My Billing and OPEX, are listed too. Only the
// route moved — the sheet, its lettering, buttons and tables apply through the
// `:where(.sheet-theme)` overrides; a page's own anatomy (a walnut hero, a
// figure strip) is not yet rebuilt into summary cards, so it stays as it was
// until that page is converted (DESIGN.md › "How a page is built on it").
//
// The Product List kept a workspace of its own here until 2026-10-08, when it
// moved into the Revenue app (`/member/products`): every portal page now sits
// on the sheet.

/** Route prefixes that render on the sheet — a prefix covers its whole subtree. */
export const SHEET_ROUTE_PREFIXES = [
  '/dashboard',
  '/hr-costing',
  '/director-salary',
  '/director-pool',
  '/revenue',
  '/claims',
  // People: People Management, Hierarchy, Roles, Permissions (and a login
  // account's page, reached from the roster) live under /team.
  '/team',
  '/member-admin',
  // Finance's view (2026-10-07), in sidebar order.
  '/approvals',
  '/payments',
  '/receipts',
  '/statements',
  // An invoice's own page (2026-10-09, the Finance revamp).
  '/invoices',
  '/billing',
  '/billing-allocator',
  '/invoice-pool',
  '/daily-bank',
  '/fund-in',
  '/fund-out',
  '/ba',
  '/overdue',
  '/repayment-schedule',
  '/dept-pool',
  '/venture-pool',
  '/opex',
  '/my-billing',
  '/reports',
  '/reconciliation',
  '/audit-log',
  '/settings',
] as const

function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/')
}

/** Does this page render on the white sheet? */
export function isSheetRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return SHEET_ROUTE_PREFIXES.some((p) => under(pathname, p))
}
