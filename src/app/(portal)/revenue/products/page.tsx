import Link from 'next/link'
import { requirePermission } from '@/lib/auth'
import { revenuePath } from '@/lib/revenue'
import { formatDate } from '@/lib/utils'
import { listSubDepartments } from '../_lib/sub-departments'
import {
  loadCombos,
  loadCostingGaps,
  loadMaintenance,
  loadMirrorStatus,
  loadModels,
  loadSkus,
} from './load'
import ProductListTabs, { type ProductTab } from './_components/ProductListTabs'
import SkuMasterTab from './_components/SkuMasterTab'
import ModularTab from './_components/ModularTab'
import MaintenanceTab from './_components/MaintenanceTab'
import ComboPricingTab from './_components/ComboPricingTab'
import CostingGapsSection from './_components/CostingGapsSection'

/**
 * Revenue → Product List — the Houzs ERP's catalogue, mirrored item by item,
 * and the portal's own prices on it (user 2026-09-24).
 *
 * THE SPLIT THE PAGE IS BUILT ON. Everything that says what EXISTS comes from
 * the ERP and arrives by itself: every SKU, every Modular model and its allowed
 * options, the Bedframe and Sofa Maintenance pools, the fabrics, the combos.
 * Everything that says what something COSTS is typed here and only here —
 * "价钱由我这边填" — and it is what every margin in the portal is measured
 * against: the Revenue calculator's, the monthly run's, the drill-downs'.
 * A delivery from the ERP never touches a price.
 *
 * Five tabs, the ERP's own four and the work list:
 *
 *   SKU Master     every SKU, and its price (a sofa module's per seat height
 *                  and fabric tier)
 *   Modular        the models, and what the Revenue calculator may offer of
 *                  each — its SKUs and its option dropdowns ("Modular 是独立的")
 *   Maintenance    the Bedframe and Sofa option pools and their surcharges;
 *                  the fabrics and the tier each costs at
 *   Combo Pricing  the sofa combos, and their price per seat height
 *   Costing gaps   what was sold and nothing could price, worth-first
 *
 * Each tab loads its own data (`?tab=`): the SKU master alone is 2,350 rows
 * and nobody reads all five at once.
 *
 * **Principal only** (`product_list`).
 */

// The portal keeps Fair from 2026-08-01 (`erp_feed_settings.min_order_date`),
// so a gap older than that is not one anybody can act on.
const GAP_WINDOW_FROM = '2026-08-01'

const TABS: readonly ProductTab[] = ['sku', 'modular', 'maintenance', 'combos', 'gaps']

export default async function ProductListPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  await requirePermission('product_list')
  const { tab: asked } = await searchParams
  const tab: ProductTab = (TABS as readonly string[]).includes(asked ?? '') ? (asked as ProductTab) : 'sku'

  const gapTo = new Date()
  gapTo.setUTCMonth(gapTo.getUTCMonth() + 1, 1)
  const gapToIso = gapTo.toISOString().slice(0, 10)

  const [status, subDepts] = await Promise.all([loadMirrorStatus(), listSubDepartments()])

  let body: React.ReactNode
  if (tab === 'sku') {
    const [skus, maintenance] = await Promise.all([loadSkus(), loadMaintenance()])
    const sofaSizes = maintenance.options
      .filter(o => o.pool === 'sofa_sizes' && !o.removed)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(o => o.value)
    body = <SkuMasterTab skus={skus} sofaSizes={sofaSizes} />
  } else if (tab === 'modular') {
    const [{ models, brands }, maintenance] = await Promise.all([loadModels(), loadMaintenance()])
    body = <ModularTab models={models} brands={brands} options={maintenance.options} />
  } else if (tab === 'maintenance') {
    const maintenance = await loadMaintenance()
    body = <MaintenanceTab options={maintenance.options} fabrics={maintenance.fabrics} />
  } else if (tab === 'combos') {
    body = <ComboPricingTab combos={await loadCombos()} />
  } else {
    body = (
      <CostingGapsSection
        gaps={await loadCostingGaps(GAP_WINDOW_FROM, gapToIso)}
        from={GAP_WINDOW_FROM}
        to={gapToIso}
      />
    )
  }

  const delivered = status.lastDeliveryAt !== null

  return (
    <div>
      <div className="page-head tabbed">
        <div>
          <div className="page-eyebrow">
            <em>I.</em> REVENUE · PRODUCT LIST
          </div>
          <h1 className="page-title">Product List</h1>
          <p className="font-serif italic text-graphite text-base mt-3 max-w-3xl">
            The Houzs ERP&apos;s catalogue, mirrored item by item — and the prices every margin in
            the portal is measured against, which are keyed here and nowhere else.
          </p>
          <p className="font-mono text-[11px] text-muted mt-2">
            {delivered ? (
              <>
                LAST DELIVERY {formatDate(status.lastDeliveryAt!)} ·{' '}
                {status.products.toLocaleString()} SKUS · {status.models.toLocaleString()} MODELS ·{' '}
                {status.options.toLocaleString()} OPTIONS · {status.fabrics.toLocaleString()} FABRICS ·{' '}
                {status.combos.toLocaleString()} COMBOS
                {status.lastStatus && status.lastStatus !== 'applied' ? (
                  <span className="text-danger"> · LAST DELIVERY {status.lastStatus.toUpperCase()}</span>
                ) : null}
              </>
            ) : status.products > 0 ? (
              <>
                {status.products.toLocaleString()} SKUS · {status.models.toLocaleString()} MODELS — LOADED
                ONCE; THE ERP HAS NOT PUSHED A DELIVERY YET
              </>
            ) : (
              <>NO DELIVERY YET — THE ERP PUSHES TO POST /api/erp/v1/products</>
            )}
          </p>
        </div>
        {subDepts.length > 0 ? (
          <Link
            href={revenuePath(subDepts[0].slug)}
            className="bg-surface hover:bg-surface-2 border border-hairline text-ink font-serif italic text-sm px-4 py-2 rounded-md transition-colors self-start"
          >
            ← {subDepts[0].name}
          </Link>
        ) : null}
      </div>

      <ProductListTabs
        active={tab}
        counts={{
          sku: status.products,
          modular: status.models,
          maintenance: status.options + status.fabrics,
          combos: status.combos,
        }}
      />

      {body}
    </div>
  )
}
