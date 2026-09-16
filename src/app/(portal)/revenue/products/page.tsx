import Link from 'next/link'
import { requirePermission } from '@/lib/auth'
import { revenuePath } from '@/lib/revenue'
import { formatDate } from '@/lib/utils'
import ProductsSection from '../_components/config/ProductsSection'
import { loadProducts } from '../_components/config/load'
import { listSubDepartments } from '../_lib/sub-departments'
import { loadSkuMaster, loadMirrorState, loadCostingGaps } from './load'
import SkuMasterSection from './_components/SkuMasterSection'
import CostingGapsSection from './_components/CostingGapsSection'

/**
 * Revenue → Product List — the ERP's SKU master, and the exceptions beside it.
 *
 * WHAT CHANGED, 2026-09-17. This page used to BE the cost master: a list typed
 * by hand, 599 of whose rows had no cost, described in its own words as "the
 * only source of cost in the portal". It never was. The ERP has carried a cost
 * per SKU the whole time, and for a sofa it carries the only cost that exists —
 * the SKU rows of a sectional are largely unpriced, and the money lives in
 * Combo Pricing, whose every row holds a cost grid and a selling grid together.
 *
 * So the page is now three things, in the order they answer a question about a
 * margin:
 *
 *   1. **SKU master** — the mirror. Read-only; the ERP owns it.
 *   2. **Costing gaps** — what was sold and could not be costed, worth-first.
 *      This is the work list, and it says which side each row belongs to.
 *   3. **Overrides** — the old `comm_products`, demoted to what it should
 *      always have been: a row only for what the ERP genuinely cannot cost.
 *
 * **Principal only** (`product_list`). HR configures the commission rules but
 * not what a product costs (user 2026-08-31), and cost is director-only on the
 * ERP side too.
 */

// The portal keeps Fair from 2026-08-01 (`erp_feed_settings.min_order_date`),
// so a gap older than that is not one anybody can act on.
const GAP_WINDOW_FROM = '2026-08-01'

export default async function ProductListPage() {
  await requirePermission('product_list')

  const gapTo = new Date()
  gapTo.setUTCMonth(gapTo.getUTCMonth() + 1, 1)
  const gapToIso = gapTo.toISOString().slice(0, 10)

  const skus = await loadSkuMaster()
  const [state, gaps, overrides, subDepts] = await Promise.all([
    loadMirrorState(skus),
    loadCostingGaps(GAP_WINDOW_FROM, gapToIso),
    loadProducts(),
    listSubDepartments(),
  ])

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REVENUE · PRODUCT LIST
          </div>
          <h1 className="page-title">Product List</h1>
          <p className="font-serif italic text-graphite text-base mt-3">
            The Houzs ERP&apos;s SKU master, mirrored — and what it still cannot cost.{' '}
            {state.lastSyncedAt ? (
              <>Last delivery {formatDate(state.lastSyncedAt)}.</>
            ) : (
              <>No delivery yet.</>
            )}
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

      <div className="space-y-12">
        <SkuMasterSection skus={skus} state={state} />
        <CostingGapsSection gaps={gaps} from={GAP_WINDOW_FROM} to={gapToIso} />
        <ProductsSection products={overrides} />
      </div>
    </div>
  )
}
