/**
 * The Revenue Department's URL vocabulary.
 *
 * Its pages are addressed by SUB-DEPARTMENT rather than by id — `Fair` (the
 * roadshow team) is `/revenue/fair` — because each sub-department calculates
 * differently, so which one a page is scoped to is the first thing a reader
 * needs to see, in the address bar as much as on the page.
 *
 * The slug comes from the NAME, not the code: `uq_sub_department_name` is what
 * the database makes unique, while `comm_sub_departments.code` is nullable and
 * unconstrained and so cannot be trusted to address a row.
 *
 * Pure, so client components can build hrefs too. The lookups live in
 * `app/(portal)/revenue/_lib/sub-departments.ts`.
 */

/**
 * Static children of `/revenue` that a sub-department slug may not shadow.
 * Next resolves a static segment before a dynamic one, so a sub-department
 * named "Products" would be unreachable rather than broken — silent, and
 * discovered only by whoever created it. `createSubDepartment` rejects these.
 */
export const RESERVED_SUB_DEPT_SLUGS: readonly string[] = ['products', 'venues']

export function subDeptSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** `/revenue/fair`, `/revenue/fair/rules`, `/revenue/fair/2026-08-01/import`. */
export function revenuePath(slug: string, ...segments: Array<string | number>): string {
  return ['/revenue', slug, ...segments].join('/')
}

/** Item code → unit cost + brand. Department-wide, so it sits outside a slug. */
export const PRODUCT_LIST_PATH = '/revenue/products'

/**
 * Every fair venue, and who organised each month's event there.
 *
 * Department-wide for the same reason as the product list: `comm_venues` and
 * `comm_organisers` carry no scheme. One venue register serves whichever
 * sub-department sells at the place.
 */
export const VENUE_REGISTER_PATH = '/revenue/venues'

/** What `pickHomeSubDepartments` needs to know about a sub-department. */
export interface HomeCandidate {
  id: string
  departmentId: string
  /** ISO timestamp — the tie-breaker is age, oldest wins. */
  createdAt: string
}

/**
 * The HOME sub-department of every department: its oldest active one.
 *
 * The company chart (`reports_to`, the company title) describes one tree per
 * department; that tree is the home sub-department's, and the database keeps
 * that membership in step with the roster. Every other sub-department is its
 * own world. The same rule as `comm_scheme_for_department` in SQL — ordered
 * by `created_at`, the first wins — so the two can never disagree about which
 * chart People is looking at.
 */
export function pickHomeSubDepartments(subs: readonly HomeCandidate[]): Set<string> {
  const oldest = new Map<string, HomeCandidate>()
  for (const s of subs) {
    const cur = oldest.get(s.departmentId)
    if (!cur || s.createdAt < cur.createdAt || (s.createdAt === cur.createdAt && s.id < cur.id)) {
      oldest.set(s.departmentId, s)
    }
  }
  return new Set([...oldest.values()].map(s => s.id))
}
