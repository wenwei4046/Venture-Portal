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
export const RESERVED_SUB_DEPT_SLUGS: readonly string[] = ['products']

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
