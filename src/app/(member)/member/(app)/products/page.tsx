import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getMemberUser } from '@/lib/auth'
import { productListAccess } from '@/lib/member/product-access'
import { formatIntlDate } from '@/lib/utils'
import { revenuePath } from '@/lib/revenue'
import { listSubDepartments } from '@/app/(portal)/revenue/_lib/sub-departments'
import {
  loadCombos,
  loadCostRatios,
  loadCostingGaps,
  loadMaintenance,
  loadMirrorStatus,
  loadModels,
  loadSchemeRules,
  loadSkus,
  loadSofaSizes,
  toPickSku,
} from './load'
import ProductListTabs, { type ProductTab } from './_components/ProductListTabs'
import SkuMasterTab from './_components/SkuMasterTab'
import ModularTab from './_components/ModularTab'
import MaintenanceTab from './_components/MaintenanceTab'
import ComboPricingTab from './_components/ComboPricingTab'
import CostingGapsSection from './_components/CostingGapsSection'
import CostSettingTab from './_components/CostSettingTab'
import ProductWorkspace from './_components/ProductWorkspace'
import { Notice } from './_components/ui'
import { layoutsFromCookies } from './_components/column-layout'
import c from './_components/products.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Product List · HOUZS Venture' }

/**
 * Revenue › Product List — the Houzs ERP's catalogue, mirrored item by item,
 * and the portal's own prices on it (user 2026-09-24). Since 2026-10-08 it is
 * a page of the Revenue app (the user moved it off the HR side: "product list
 * 是 set 给 revenue team 的人去算 margin 的"), drawn to the design handoff
 * (design_handoff_product_list).
 *
 * THE SPLIT THE PAGE IS BUILT ON. Everything that says what EXISTS comes from
 * the ERP and arrives by itself: every SKU, every Modular model and its allowed
 * options, the Bedframe and Sofa Maintenance pools, the fabrics, the combos.
 * Everything that says what something COSTS is typed here and only here —
 * "价钱由我这边填" — and it is what every margin in the portal is measured
 * against: the Revenue calculator's, the monthly run's, the drill-downs'.
 * A delivery from the ERP never touches a price. The one thing made here that
 * the ERP has not: a sofa combo added on Combo Pricing (2026-10-08), costed
 * exactly as the ERP's are.
 *
 * Six tabs — the ERP's own four, the work list, and a setting:
 *
 *   SKU Master          every SKU, and its price (a sofa module's per seat
 *                       height and fabric tier)
 *   Modular             the models, and what the Revenue calculator may offer
 *                       of each — its SKUs and its option dropdowns
 *   Maintenance         the Bedframe and Sofa option pools and their charges;
 *                       the fabrics and the tier each costs at
 *   Combo Pricing       the sofa combos, and their price per seat height
 *   Costing gaps        what was sold and nothing could price, worth-first
 *   Costing Setting     the ratio a cost is divided by for the Revenue Team,
 *                       and the SKUs divided by a ratio of their own
 *
 * The seventh, Add-on / KPI Items, moved to Rules › KPI items on 2026-10-08
 * (user: "rules 这里是用来算薪水的 … product list 是拿来 set costing 的"): which
 * items count as KPI is a rule of the pay, not a price. `?tab=kpi` is sent
 * there.
 *
 * Each tab loads its own data (`?tab=`): the SKU master alone is 2,350 rows
 * and nobody reads all six at once. Costing Setting is per sub-department
 * (`?sub=`, the first when absent).
 *
 * **Only for an account holding `product_list`** (the Principal by default):
 * anybody else is sent back to the app, before anything is read.
 */

// The portal keeps Fair from 2026-08-01 (`erp_feed_settings.min_order_date`),
// so a gap older than that is not one anybody can act on.
const GAP_WINDOW_FROM = '2026-08-01'

const TABS: readonly ProductTab[] = ['sku', 'modular', 'maintenance', 'combos', 'gaps', 'costing']

/** 2026-08-01 → "1 Aug 2026", the prototype's way of writing the window. */
const dayLabel = (iso: string) => formatIntlDate(new Date(`${iso}T00:00:00Z`), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }, 'en-GB')

function names(list: string[]): string {
  return list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

export default async function ProductListPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; sub?: string }>
}) {
  const user = await getMemberUser()
  if (!user) redirect('/login')
  const access = await productListAccess(user)
  if (!access) redirect('/member')

  const { tab: asked, q, sub: subAsked } = await searchParams
  const tab: ProductTab = (TABS as readonly string[]).includes(asked ?? '') ? (asked as ProductTab) : 'sku'

  const gapTo = new Date()
  gapTo.setUTCMonth(gapTo.getUTCMonth() + 1, 1)
  const gapToIso = gapTo.toISOString().slice(0, 10)

  const [status, subDepts] = await Promise.all([loadMirrorStatus(), listSubDepartments()])

  // Add-on / KPI Items is Rules › KPI items since 2026-10-08: an old link
  // opens it there, for the sub-department it named.
  if (asked === 'kpi') {
    const target = subDepts.find(s => s.slug === subAsked) ?? subDepts[0]
    if (target) redirect(`${revenuePath(target.slug, 'rules')}?tab=kpi`)
  }
  // The columns as this reader arranged them, so the first paint is already theirs.
  const columnLayouts = layoutsFromCookies((await cookies()).getAll())

  let body: React.ReactNode
  if (tab === 'sku') {
    const [skus, sofaSizes] = await Promise.all([loadSkus(), loadSofaSizes()])
    body = <SkuMasterTab skus={skus} sofaSizes={sofaSizes} initialQuery={q ?? ''} columnLayouts={columnLayouts} />
  } else if (tab === 'modular') {
    const [{ models, brands }, maintenance] = await Promise.all([loadModels(), loadMaintenance()])
    body = <ModularTab models={models} brands={brands} options={maintenance.options} />
  } else if (tab === 'maintenance') {
    const maintenance = await loadMaintenance()
    body = <MaintenanceTab options={maintenance.options} fabrics={maintenance.fabrics} />
  } else if (tab === 'combos') {
    const [combos, skus, sofaSizes] = await Promise.all([loadCombos(), loadSkus(), loadSofaSizes()])
    body = <ComboPricingTab combos={combos} sofaSkus={skus.filter(s => (s.category ?? '').toUpperCase() === 'SOFA' && !s.removed)} sofaSizes={sofaSizes} />
  } else if (tab === 'costing') {
    // Per sub-department: each keeps its own ratio.
    const current = subDepts.find(s => s.slug === subAsked) ?? subDepts[0]
    const subs = subDepts.map(s => ({ slug: s.slug, name: s.name }))
    const rules = current?.schemeId ? await loadSchemeRules(current.schemeId) : null
    if (!current || !current.schemeId || !rules) {
      body = <Notice tone="error">{current ? `${current.name} has no active scheme yet.` : 'No Revenue sub-department is set up yet.'}</Notice>
    } else {
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
    }
  } else {
    body = (
      <CostingGapsSection
        gaps={await loadCostingGaps(GAP_WINDOW_FROM, gapToIso)}
        from={dayLabel(GAP_WINDOW_FROM)}
        to={dayLabel(gapToIso)}
        columnLayouts={columnLayouts}
      />
    )
  }

  return (
    <ProductWorkspace tab={tab}>
      <div className={c.head}>
        <div className={c.headText}>
          <span className={c.eyebrow}><span className={c.eyebrowDash} />REVENUE / PRODUCTS</span>
          <h1 className={c.title}>Product List</h1>
        </div>
        <span className={c.headNote}>
          {access.audience}{subDepts.length > 0 ? ` · ${names(subDepts.map(s => s.name))}` : ''}
        </span>
      </div>

      <ProductListTabs active={tab} />

      {status.lastStatus && status.lastStatus !== 'applied' ? (
        <Notice tone="error">
          Last catalogue delivery: {status.lastStatus}. The list below shows the latest available items.
        </Notice>
      ) : null}

      {body}
    </ProductWorkspace>
  )
}
