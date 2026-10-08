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
export const RESERVED_SUB_DEPT_SLUGS: readonly string[] = ['products', 'department']

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

/**
 * Item code → unit cost + brand. Department-wide, so it sits outside a slug —
 * and since 2026-10-08 in the Revenue app, not on the HR side (the old
 * `/revenue/products` redirects here).
 */
export const PRODUCT_LIST_PATH = '/member/products'

/** The Product List opened on a tab (`sku` is the first), a search, a sub-department. */
export function productListPath(open: { tab?: string | null; q?: string | null; sub?: string | null } = {}): string {
  const q = new URLSearchParams()
  if (open.tab && open.tab !== 'sku') q.set('tab', open.tab)
  if (open.sub) q.set('sub', open.sub)
  if (open.q) q.set('q', open.q)
  const s = q.toString()
  return s ? `${PRODUCT_LIST_PATH}?${s}` : PRODUCT_LIST_PATH
}

/** The Revenue Department as a whole: its mode (2026-09-30), later its pool. */
export const REVENUE_DEPARTMENT_PATH = '/revenue/department'

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
/** What deciding one person's home needs to know about them. */
export interface HomeMember {
  departmentId: string | null
  /**
   * Their own choice of base. Null — which is what everybody carried before
   * 2026-09-20 — means the department's default.
   */
  homeSubDepartmentId?: string | null
}

/** A sub-department, as `homeSubDepartmentOf` needs to see it. */
export interface HomeChoice {
  id: string
  departmentId: string
  /** The department's default home: its oldest, per `pickHomeSubDepartments`. */
  isHome: boolean
}

/**
 * The sub-department ONE PERSON is based in (2026-09-20).
 *
 * Their own `home_sub_department_id` while it belongs to their department,
 * else that department's default. The TypeScript twin of
 * `comm_home_sub_department` in SQL, and the two must agree: this decides
 * which chart draws somebody from the roster, and that decides which
 * membership the database derives.
 */
export function homeSubDepartmentOf(
  person: HomeMember,
  subs: readonly HomeChoice[],
): string | null {
  if (!person.departmentId) return null
  const chosen = person.homeSubDepartmentId
    ? subs.find(s => s.id === person.homeSubDepartmentId && s.departmentId === person.departmentId)
    : undefined
  if (chosen) return chosen.id
  return subs.find(s => s.isHome && s.departmentId === person.departmentId)?.id ?? null
}

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
