import Link from 'next/link'
import { requireRole } from '@/lib/auth'
import { revenuePath } from '@/lib/revenue'
import ProductsSection from '../_components/config/ProductsSection'
import { loadProducts } from '../_components/config/load'
import { listSubDepartments } from '../_lib/sub-departments'

/**
 * Item code → unit cost + brand.
 *
 * The ERP sales-order export carries no cost column, so without a row here a
 * line has no cost, its bill has no margin, and both the below-margin penalty
 * and the monthly incentive are skipped with a warning rather than quietly
 * paying full commission on a bad-margin bill.
 *
 * It sits at DEPARTMENT level, beside the sub-departments rather than inside
 * one: `comm_products` carries no `scheme_id` — there is one cost master for
 * the whole Revenue Department, and showing the same list on every
 * sub-department's tab rail would suggest otherwise.
 *
 * **Principal only.** HR configures the commission rules but not what a
 * product costs (user 2026-08-31) — the import stamps `qty × unit_cost` onto
 * each line once, so this list is what a run's margin is judged against.
 */
export default async function ProductListPage() {
  await requireRole(['principal'])
  const [products, subDepts] = await Promise.all([loadProducts(), listSubDepartments()])

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REVENUE · PRODUCT LIST
          </div>
          <h1 className="page-title">Product List</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            Unit cost and brand per item code, for the whole Revenue Department.{' '}
            <em>The only source of cost in the portal.</em>
          </p>
        </div>
        {subDepts.length > 0 ? (
          <Link
            href={revenuePath(subDepts[0].slug)}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors"
          >
            ← {subDepts[0].name}
          </Link>
        ) : null}
      </div>

      <ProductsSection products={products} />
    </div>
  )
}
