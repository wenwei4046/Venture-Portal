import Link from 'next/link'
import { cookies } from 'next/headers'
import { requirePermission } from '@/lib/auth'
import { revenuePath } from '@/lib/revenue'
import { listSubDepartments } from '../_lib/sub-departments'
import {
  loadCombos,
  loadCostRatios,
  loadCostingGaps,
  loadKpiItems,
  loadMaintenance,
  loadMirrorStatus,
  loadModels,
  loadSchemeRules,
  loadSkus,
  toPickSku,
} from './load'
import ProductListTabs, { type ProductTab } from './_components/ProductListTabs'
import SkuMasterTab from './_components/SkuMasterTab'
import ModularTab from './_components/ModularTab'
import MaintenanceTab from './_components/MaintenanceTab'
import ComboPricingTab from './_components/ComboPricingTab'
import CostingGapsSection from './_components/CostingGapsSection'
import CostSettingTab from './_components/CostSettingTab'
import KpiItemsTab from './_components/KpiItemsTab'
import ProductWorkspace from './_components/ProductWorkspace'
import { layoutsFromCookies } from './_components/column-layout'

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
 * Seven tabs — the ERP's own four, the work list, and two settings:
 *
 *   SKU Master          every SKU, and its price (a sofa module's per seat
 *                       height and fabric tier)
 *   Modular             the models, and what the Revenue calculator may offer
 *                       of each — its SKUs and its option dropdowns
 *                       ("Modular 是独立的")
 *   Maintenance         the Bedframe and Sofa option pools and their
 *                       surcharges; the fabrics and the tier each costs at
 *   Combo Pricing       the sofa combos, and their price per seat height
 *   Costing gaps        what was sold and nothing could price, worth-first
 *   Costing Setting     the ratio a cost is divided by for the Revenue Team,
 *                       and the SKUs divided by a ratio of their own
 *   Add-on / KPI Items  SKUs and Maintenance specials paid flat as KPI and
 *                       taken off the bill's sales (2026-09-27)
 *
 * Each tab loads its own data (`?tab=`): the SKU master alone is 2,350 rows
 * and nobody reads all seven at once. The two settings are per sub-department
 * (`?sub=`, the first when absent).
 *
 * **Principal only** (`product_list`).
 */

// The portal keeps Fair from 2026-08-01 (`erp_feed_settings.min_order_date`),
// so a gap older than that is not one anybody can act on.
const GAP_WINDOW_FROM = '2026-08-01'

const TABS: readonly ProductTab[] = ['sku', 'modular', 'maintenance', 'combos', 'gaps', 'costing', 'kpi']

export default async function ProductListPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; sub?: string }>
}) {
  await requirePermission('product_list')
  const { tab: asked, q, sub: subAsked } = await searchParams
  const tab: ProductTab = (TABS as readonly string[]).includes(asked ?? '') ? (asked as ProductTab) : 'sku'

  const gapTo = new Date()
  gapTo.setUTCMonth(gapTo.getUTCMonth() + 1, 1)
  const gapToIso = gapTo.toISOString().slice(0, 10)

  const [status, subDepts] = await Promise.all([loadMirrorStatus(), listSubDepartments()])
  // The columns as this reader arranged them, so the first paint is already theirs.
  const columnLayouts = layoutsFromCookies((await cookies()).getAll())

  let body: React.ReactNode
  if (tab === 'sku') {
    const [skus, maintenance] = await Promise.all([loadSkus(), loadMaintenance()])
    const sofaSizes = maintenance.options
      .filter(o => o.pool === 'sofa_sizes' && !o.removed)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(o => o.value)
    body = <SkuMasterTab skus={skus} sofaSizes={sofaSizes} initialQuery={q ?? ''} columnLayouts={columnLayouts} />
  } else if (tab === 'modular') {
    const [{ models, brands }, maintenance] = await Promise.all([loadModels(), loadMaintenance()])
    body = <ModularTab models={models} brands={brands} options={maintenance.options} />
  } else if (tab === 'maintenance') {
    const maintenance = await loadMaintenance()
    body = <MaintenanceTab options={maintenance.options} fabrics={maintenance.fabrics} />
  } else if (tab === 'combos') {
    body = <ComboPricingTab combos={await loadCombos()} />
  } else if (tab === 'costing' || tab === 'kpi') {
    // Per sub-department: each keeps its own ratio and its own KPI items.
    const current = subDepts.find(s => s.slug === subAsked) ?? subDepts[0]
    const subs = subDepts.map(s => ({ slug: s.slug, name: s.name }))
    const rules = current?.schemeId ? await loadSchemeRules(current.schemeId) : null
    if (!current || !current.schemeId || !rules) {
      body = (
        <p className="product-sync-notice" role="status">
          {current ? `${current.name} has no active scheme yet.` : 'No Revenue sub-department is set up yet.'}
        </p>
      )
    } else if (tab === 'costing') {
      const [skus, ratios] = await Promise.all([loadSkus(), loadCostRatios(current.schemeId)])
      body = (
        <CostSettingTab
          key={current.slug}
          sub={{ slug: current.slug, name: current.name }}
          subs={subs}
          schemeId={current.schemeId}
          divisor={rules.divisor}
          ratios={ratios}
          skus={skus.map(toPickSku)}
        />
      )
    } else {
      const [skus, items, maintenance] = await Promise.all([
        loadSkus(),
        loadKpiItems(current.schemeId),
        loadMaintenance(),
      ])
      body = (
        <KpiItemsTab
          key={current.slug}
          sub={{ slug: current.slug, name: current.name }}
          subs={subs}
          schemeId={current.schemeId}
          enableKpi={rules.enableKpi}
          items={items}
          skus={skus.map(toPickSku)}
          specials={maintenance.options.filter(o => o.pool === 'bedframe_specials' || o.pool === 'sofa_specials')}
        />
      )
    }
  } else {
    body = (
      <CostingGapsSection
        gaps={await loadCostingGaps(GAP_WINDOW_FROM, gapToIso)}
        from={GAP_WINDOW_FROM}
        to={gapToIso}
        columnLayouts={columnLayouts}
      />
    )
  }

  return (
    <ProductWorkspace tab={tab}>
      <div className="page-head tabbed">
        <div>
          <div className="page-eyebrow">
            <em aria-hidden="true" /> REVENUE / PRODUCTS
          </div>
          <h1 className="page-title">Product List</h1>
        </div>
        {subDepts.length > 0 ? (
          <Link
            href={revenuePath(subDepts[0].slug)}
            className="product-back-link"
          >
            ← {subDepts[0].name}
          </Link>
        ) : null}
      </div>

      <ProductListTabs active={tab} />

      {status.lastStatus && status.lastStatus !== 'applied' ? (
        <p className="product-sync-notice" role="status">
          Last catalogue delivery: {status.lastStatus}. The list below shows the latest available items.
        </p>
      ) : null}

      {body}
    </ProductWorkspace>
  )
}
