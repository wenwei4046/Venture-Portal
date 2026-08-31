import { requireRole } from '@/lib/auth'
import CommissionTabs from '../_components/CommissionTabs'
import ProductsSection from '../_components/config/ProductsSection'
import { loadProducts } from '../_components/config/load'

/**
 * Item code → unit cost + brand.
 *
 * The ERP sales-order export carries no cost column, so without a row here a
 * line has no cost, its bill has no margin, and both the below-margin penalty
 * and the monthly incentive are skipped with a warning rather than quietly
 * paying full commission on a bad-margin bill.
 *
 * **Principal only.** HR configures the commission rules next door but not what
 * a product costs (user 2026-08-31) — the import stamps `qty × unit_cost` onto
 * each line once, so this list is what a run's margin is judged against.
 */
export default async function CommissionProductsPage() {
  await requireRole(['principal'])
  const products = await loadProducts()

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> HR · COMMISSION · PRODUCT LIST
          </div>
          <h1 className="page-title">Product list</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            Unit cost and brand per item code. <em>The only source of cost in the
            portal.</em>
          </p>
        </div>
      </div>

      <CommissionTabs active="products" canSeeProducts />

      <ProductsSection products={products} />
    </div>
  )
}
