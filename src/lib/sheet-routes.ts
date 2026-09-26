// Which pages sit on the white sheet (DESIGN.md › "Sheet theme", 2026-09-27).
//
// Comm Cal's month (#151 → #162) set the portal's new tone: the content on one
// white, rounded sheet inside the unchanged plaster shell, black lettering, the
// lighter orange for actions and markers, summary cards, and tables with an
// uppercase header band. The user asked for the rest of the portal to follow,
// HR's view first — the pages under HR Costing, Director Salary, Director Pool,
// Revenue and Claims. PortalFrame draws the sheet for every path listed here,
// so a page's detail routes, print previews and loading skeleton land on it
// too, and the sheet stays put while one of these pages replaces another.
//
// The Product List keeps its own workspace (`.product-theme`), which re-tones
// the shell as well and decides its own scrolling per tab (`productTabScroll`).

/** Route prefixes that render on the sheet — a prefix covers its whole subtree. */
export const SHEET_ROUTE_PREFIXES = [
  '/hr-costing',
  '/director-salary',
  '/director-pool',
  '/revenue',
  '/claims',
] as const

/** Routes under a prefix that keep a workspace of their own. */
const OWN_WORKSPACE = ['/revenue/products']

function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/')
}

/** Does this page render on the white sheet? */
export function isSheetRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  if (OWN_WORKSPACE.some((p) => under(pathname, p))) return false
  return SHEET_ROUTE_PREFIXES.some((p) => under(pathname, p))
}
