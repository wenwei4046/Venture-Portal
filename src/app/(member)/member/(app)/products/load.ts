import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { priceGridOf, type PriceCell } from '@/lib/catalogue/pricing'
import { calcCategoryOf, defaultGift, needsBrandPick, sellsUnderBrand, skuOptionLabel } from '@/lib/catalogue/options'
import { normaliseComboModules } from '@/lib/catalogue/combos'
import { isKivSize, type KivSize } from '@/lib/catalogue/edits'

/**
 * What the Product List reads: the ERP's catalogue as mirrored (`erp_*`, items
 * only) beside the portal's own decisions about it (`catalogue_*`: prices,
 * calculator ticks). Nothing here writes; the actions are
 * `../catalogue-actions.ts`.
 *
 * EVERY QUERY THAT CAN EXCEED 1,000 ROWS PAGES EXPLICITLY. PostgREST caps a
 * response at 1,000 rows and says nothing — the old page printed "1000
 * PRODUCTS" over a table of 1,553 — and the SKU master alone is 2,350.
 */

const PAGE = 1000

/**
 * The catalogue tables postdate `database.types.ts`; the untyped-client
 * convention is applied once, here at the boundary, so what the page touches
 * stays typed.
 */
async function untyped(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

type Row = Record<string, unknown>

async function all(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const page = (data ?? []) as Row[]
    out.push(...page)
    if (page.length < PAGE) return out
  }
}

const str = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v))
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * "New" = arrived after the first load, in the last 30 days. The first load
 * stamps everything at once, and calling 2,350 SKUs new says nothing.
 */
function newness(rows: Row[]): (firstSeen: string | null) => boolean {
  const stamps = rows.map(r => str(r.first_seen_at)).filter((s): s is string => s !== null).sort()
  const baseline = stamps.length > 0 ? Date.parse(stamps[0]) + 6 * 3600_000 : Infinity
  const window = Date.now() - 30 * 86_400_000
  return firstSeen => {
    if (!firstSeen) return false
    const t = Date.parse(firstSeen)
    return t > baseline && t > window
  }
}

// ─── Brands — the margin ladder a model sells under ─────────────────────────

export interface BrandRef {
  code: string
  name: string
}

async function loadBrands(sb: SupabaseClient): Promise<BrandRef[]> {
  const data = await all((from, to) => sb
    .from('comm_brands')
    .select('code, name, is_active, created_at')
    .eq('is_active', true)
    .order('created_at')
    .order('id')
    .range(from, to))
  const seen = new Set<string>()
  const out: BrandRef[] = []
  for (const r of (data ?? []) as Row[]) {
    const code = String(r.code)
    if (seen.has(code)) continue
    seen.add(code)
    out.push({ code, name: String(r.name ?? code) })
  }
  return out
}

/** `erp_sync_brand_code` in TypeScript: a brand by its code or its name. */
function brandByName(name: string | null, brands: BrandRef[]): string | null {
  const n = (name ?? '').trim().toUpperCase()
  if (!n) return null
  return brands.find(b => b.code.toUpperCase() === n || b.name.toUpperCase() === n)?.code ?? null
}

/**
 * `catalogue_brand_of`: only a mattress or a sofa sells under a brand; every
 * other category is a rider (user 2026-09-12), whatever the ERP writes on it.
 */
export function brandOf(
  category: string | null,
  modelBranding: string | null,
  skuBranding: string | null,
  brands: BrandRef[],
): string | null {
  if (!sellsUnderBrand(category)) return null
  return brandByName(modelBranding, brands) ?? brandByName(skuBranding, brands)
}

// ─── The mirror's pulse ─────────────────────────────────────────────────────

export interface MirrorStatus {
  products: number
  models: number
  options: number
  fabrics: number
  lastDeliveryAt: string | null
  lastStatus: string | null
  lastMessage: string | null
}

export async function loadMirrorStatus(): Promise<MirrorStatus> {
  const sb = await untyped()
  const count = async (table: string, live = true) => {
    let q = sb.from(table).select('*', { count: 'exact', head: true })
    if (live) q = q.is('removed_at', null)
    const { count: n, error } = await q
    if (error) throw new Error(error.message)
    return n ?? 0
  }
  // Combos are not the mirror's any more (2026-10-08): the portal keeps its own.
  const [products, models, options, fabrics, last] = await Promise.all([
    count('erp_products'),
    count('erp_product_models'),
    count('erp_maintenance_options'),
    count('erp_fabrics'),
    sb
      .from('erp_sync_events')
      .select('received_at, status, message')
      .eq('doc_no', 'catalogue')
      .order('received_at', { ascending: false })
      .limit(1),
  ])
  if (last.error) throw new Error(last.error.message)
  const lastRow = ((last.data ?? []) as Row[])[0]
  return {
    products,
    models,
    options,
    fabrics,
    lastDeliveryAt: lastRow ? str(lastRow.received_at) : null,
    lastStatus: lastRow ? str(lastRow.status) : null,
    lastMessage: lastRow ? str(lastRow.message) : null,
  }
}

// ─── SKU master ─────────────────────────────────────────────────────────────

export interface CatalogueSku {
  erpId: string
  code: string
  description: string | null
  category: string | null
  modelId: string | null
  modelCode: string | null
  /** The model's name: the portal's own (`catalogue_models.model_name`) before the ERP's. */
  modelName: string | null
  /** A sofa module's base model as the ERP writes it — what a combo is keyed on (`erp_products.base_model`). */
  baseModel: string | null
  moduleCode: string | null
  sizeCode: string | null
  sizeLabel: string | null
  /** The one label the SKU carries under its model: module, size word, or code. */
  optionLabel: string
  branding: string | null
  /** The margin ladder it sells under; null = a rider. */
  brand: string | null
  active: boolean
  removed: boolean
  isNew: boolean
  price: number | null
  grid: PriceCell[] | null
  offered: boolean
  /** The model is offered too — the SKU reaches the calculator only when both are. */
  modelOffered: boolean
  /** Carried over from the old Product List on first sight. */
  adopted: boolean
}

interface SkuTables {
  products: Row[]
  prices: Map<string, Row>
  models: Map<string, Row>
  offeredModels: Set<string>
  /** The names the portal gave its models (Modular, 2026-10-19), by ERP model id. */
  ownNames: Map<string, string>
  brands: BrandRef[]
}

/** The names the portal gave its models, out of `catalogue_models` rows. */
function ownNamesOf(rows: Row[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of rows) {
    const name = str(r.model_name)
    if (name) out.set(String(r.erp_model_id), name)
  }
  return out
}

async function loadSkuTables(sb: SupabaseClient): Promise<SkuTables> {
  const [products, prices, models, brands, modelRows] = await Promise.all([
    all((f, t) =>
      sb
        .from('erp_products')
        .select(
          'erp_id, item_code, description, category, model_erp_id, base_model, module_code, size_code, size_label, ' +
            'branding, active, removed_at, first_seen_at',
        )
        .order('item_code')
        .order('erp_id')
        .range(f, t),
    ),
    all((f, t) =>
      sb
        .from('catalogue_skus')
        .select('erp_product_id, offered, price, price_grid, adopted_from')
        .order('erp_product_id')
        .range(f, t),
    ),
    all((f, t) =>
      sb
        .from('erp_product_models')
        .select('erp_id, model_code, name, branding')
        .order('erp_id')
        .range(f, t),
    ),
    loadBrands(sb),
    all((f, t) =>
      sb.from('catalogue_models').select('erp_model_id, offered, model_name').order('erp_model_id').range(f, t),
    ),
  ])
  return {
    products,
    prices: new Map(prices.map(p => [String(p.erp_product_id), p])),
    models: new Map(models.map(m => [String(m.erp_id), m])),
    offeredModels: new Set(modelRows.filter(m => m.offered === true).map(m => String(m.erp_model_id))),
    ownNames: ownNamesOf(modelRows),
    brands,
  }
}

function toSku(r: Row, t: SkuTables, isNew: (s: string | null) => boolean): CatalogueSku {
  const erpId = String(r.erp_id)
  const model = r.model_erp_id ? t.models.get(String(r.model_erp_id)) : undefined
  const p = t.prices.get(erpId)
  const grid = p ? priceGridOf(p.price_grid) : []
  const category = str(r.category)
  const sku = {
    category,
    module_code: str(r.module_code),
    size_code: str(r.size_code),
    size_label: str(r.size_label),
    item_code: String(r.item_code),
  }
  return {
    erpId,
    code: sku.item_code,
    description: str(r.description),
    category,
    modelId: str(r.model_erp_id),
    modelCode: model ? str(model.model_code) : null,
    modelName: model ? t.ownNames.get(String(r.model_erp_id)) ?? str(model.name) : null,
    baseModel: str(r.base_model),
    moduleCode: sku.module_code,
    sizeCode: sku.size_code,
    sizeLabel: sku.size_label,
    optionLabel: skuOptionLabel(sku),
    branding: str(r.branding),
    brand: brandOf(category, model ? str(model.branding) : null, str(r.branding), t.brands),
    active: r.active !== false,
    removed: r.removed_at !== null && r.removed_at !== undefined,
    isNew: isNew(str(r.first_seen_at)),
    price: p ? num(p.price) : null,
    grid: grid.length > 0 ? grid : null,
    offered: p ? p.offered === true : false,
    modelOffered: r.model_erp_id ? t.offeredModels.has(String(r.model_erp_id)) : false,
    adopted: p ? p.adopted_from !== null && p.adopted_from !== undefined : false,
  }
}

export async function loadSkus(): Promise<CatalogueSku[]> {
  const sb = await untyped()
  const t = await loadSkuTables(sb)
  const isNew = newness(t.products)
  return t.products.map(r => toSku(r, t, isNew))
}

// ─── Modular ────────────────────────────────────────────────────────────────

export interface CatalogueModel {
  erpId: string
  code: string
  /** The name it is shown by: `ownName` before `erpName`. */
  name: string | null
  /** The ERP's own name for it, as mirrored — also what its calculator section is read from. */
  erpName: string | null
  /** The name the portal gave it on Modular (`catalogue_models.model_name`, a sofa's — 2026-10-19). */
  ownName: string | null
  category: string | null
  branding: string | null
  active: boolean
  removed: boolean
  isNew: boolean
  /** The ERP's own ticks, verbatim. */
  allowed: Record<string, unknown>
  /** The portal's decisions. */
  configured: boolean
  offered: boolean
  enabled: Record<string, string[]>
  gift: boolean
  giftOverride: boolean | null
  calcCategory: string
  /** The section picked on Modular — only ever read while `needsBrandPick`; null otherwise. */
  calcOverride: string | null
  brand: string | null
  /** The ladder picked on Modular (a brand code or RIDER) — only ever read while `needsBrandPick`; null otherwise. */
  brandOverride: string | null
  /** The brand the ERP branding alone gives — what "From the ERP branding" means. */
  derivedBrand: string | null
  skus: CatalogueSku[]
}

function enabledOf(v: unknown): Record<string, string[]> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, string[]> = {}
  for (const [k, list] of Object.entries(v as Record<string, unknown>)) {
    if (Array.isArray(list)) out[k] = list.map(x => String(x)).filter(Boolean)
  }
  return out
}

export async function loadModels(): Promise<{ models: CatalogueModel[]; brands: BrandRef[] }> {
  const sb = await untyped()
  const [t, models, settings] = await Promise.all([
    loadSkuTables(sb),
    all((f, tt) =>
      sb
        .from('erp_product_models')
        .select('erp_id, model_code, name, category, branding, active, allowed_options, removed_at, first_seen_at')
        .order('model_code')
        .order('erp_id')
        .range(f, tt),
    ),
    all((f, tt) =>
      sb
        .from('catalogue_models')
        .select('erp_model_id, offered, enabled, gift, calc_category, brand_code, model_name')
        .order('erp_model_id')
        .range(f, tt),
    ),
  ])
  const isNewSku = newness(t.products)
  const isNewModel = newness(models)
  const byModel = new Map<string, CatalogueSku[]>()
  for (const r of t.products) {
    if (!r.model_erp_id) continue
    const sku = toSku(r, t, isNewSku)
    const list = byModel.get(String(r.model_erp_id)) ?? []
    list.push(sku)
    byModel.set(String(r.model_erp_id), list)
  }
  const settingsById = new Map(settings.map(s => [String(s.erp_model_id), s]))

  return {
    brands: t.brands,
    models: models.map(m => {
      const erpId = String(m.erp_id)
      const s = settingsById.get(erpId)
      const category = str(m.category)
      const skus = byModel.get(erpId) ?? []
      const derivedCalc = calcCategoryOf(category, str(m.name) ?? str(m.model_code))
      const derivedBrand = brandOf(category, str(m.branding), skus.find(k => k.branding)?.branding ?? null, t.brands)
      // The ERP's branding decides the ladder and the section; a pick counts
      // only where it cannot — as member_catalogue reads it (2026-10-06).
      const picks = needsBrandPick(category, derivedBrand)
      const calcOverride = picks && s ? str(s.calc_category) : null
      const calc = calcOverride ?? derivedCalc
      const giftOverride = s && s.gift !== null && s.gift !== undefined ? s.gift === true : null
      const brandOverride = picks && s ? str(s.brand_code) : null
      const ownName = s ? str(s.model_name) : null
      return {
        erpId,
        code: String(m.model_code),
        name: ownName ?? str(m.name),
        erpName: str(m.name),
        ownName,
        category,
        branding: str(m.branding),
        active: m.active !== false,
        removed: m.removed_at !== null && m.removed_at !== undefined,
        isNew: isNewModel(str(m.first_seen_at)),
        allowed:
          m.allowed_options && typeof m.allowed_options === 'object' && !Array.isArray(m.allowed_options)
            ? (m.allowed_options as Record<string, unknown>)
            : {},
        configured: s !== undefined,
        offered: s ? s.offered === true : false,
        enabled: s ? enabledOf(s.enabled) : {},
        gift: giftOverride ?? defaultGift(calc),
        giftOverride,
        calcCategory: calc,
        calcOverride,
        brand: brandOverride ?? derivedBrand,
        brandOverride,
        derivedBrand,
        skus,
      }
    }),
  }
}

// ─── Maintenance ────────────────────────────────────────────────────────────

export interface MaintenanceOption {
  pool: string
  value: string
  label: string
  sortOrder: number
  active: boolean
  removed: boolean
  isNew: boolean
  price: number | null
  /** A sofa special charged by the quantity the member sets (2026-10-26); false = once (per sofa, per frame). */
  byQuantity: boolean
}

export interface FabricRow {
  erpId: string
  code: string
  description: string | null
  series: string | null
  category: string | null
  sofaTier: string | null
  bedframeTier: string | null
  /** Legacy shared tier used when the category-specific tier is absent. */
  priceTier: string | null
  active: boolean
  removed: boolean
}

/**
 * A fabric upgrade (2026-10-29, Maintenance › Fabrics › Sofa / Bedframe
 * upgrades): its name — what the Quote says — its charge, and the fabric series
 * ticked under it, as the fabric list spells them.
 */
export interface FabricUpgradeRow {
  id: string
  category: 'SOFA' | 'BEDFRAME'
  name: string
  price: number
  series: string[]
}

export async function loadMaintenance(): Promise<{ options: MaintenanceOption[]; fabrics: FabricRow[]; upgrades: FabricUpgradeRow[] }> {
  const sb = await untyped()
  const [options, prices, fabrics, upgrades, upgradeSeries] = await Promise.all([
    all((f, t) =>
      sb
        .from('erp_maintenance_options')
        .select('pool, value, label, sort_order, active, removed_at, first_seen_at')
        .eq('erp_company_id', 1)
        .order('pool')
        .order('sort_order')
        .order('value')
        .range(f, t),
    ),
    all((f, t) =>
      sb.from('catalogue_option_prices').select('pool, value, price, by_quantity').eq('erp_company_id', 1).order('pool').order('value').range(f, t),
    ),
    all((f, t) =>
      sb
        .from('erp_fabrics')
        .select('erp_id, fabric_code, description, series, category, sofa_tier, bedframe_tier, price_tier, active, removed_at')
        .eq('erp_company_id', 1)
        .order('fabric_code')
        .order('erp_id')
        .range(f, t),
    ),
    all((f, t) =>
      sb.from('catalogue_fabric_upgrades').select('id, category, name, price').eq('erp_company_id', 1).order('name').order('id').range(f, t),
    ),
    all((f, t) =>
      sb
        .from('catalogue_fabric_upgrade_series')
        .select('upgrade_id, series')
        .eq('erp_company_id', 1)
        .order('series')
        .order('upgrade_id')
        .range(f, t),
    ),
  ])
  const seriesOf = new Map<string, string[]>()
  for (const s of upgradeSeries) seriesOf.set(String(s.upgrade_id), [...(seriesOf.get(String(s.upgrade_id)) ?? []), String(s.series)])
  const priceOf = new Map(prices.map(p => [`${p.pool}\u0000${p.value}`, num(p.price)]))
  const counted = new Set(prices.filter(p => p.by_quantity === true).map(p => `${p.pool}\u0000${p.value}`))
  const isNew = newness(options)
  return {
    options: options.map(o => ({
      pool: String(o.pool),
      value: String(o.value),
      label: String(o.label ?? o.value),
      sortOrder: Number(o.sort_order ?? 0),
      active: o.active !== false,
      removed: o.removed_at !== null && o.removed_at !== undefined,
      isNew: isNew(str(o.first_seen_at)),
      price: priceOf.get(`${o.pool}\u0000${o.value}`) ?? null,
      byQuantity: counted.has(`${o.pool}\u0000${o.value}`),
    })),
    fabrics: fabrics.map(f => ({
      erpId: String(f.erp_id),
      code: String(f.fabric_code),
      description: str(f.description),
      series: str(f.series),
      category: str(f.category),
      sofaTier: str(f.sofa_tier),
      bedframeTier: str(f.bedframe_tier),
      priceTier: str(f.price_tier),
      active: f.active !== false,
      removed: f.removed_at !== null && f.removed_at !== undefined,
    })),
    upgrades: upgrades.flatMap(u => {
      const category = String(u.category)
      if (category !== 'SOFA' && category !== 'BEDFRAME') return []
      return [{ id: String(u.id), category, name: String(u.name), price: num(u.price) ?? 0, series: seriesOf.get(String(u.id)) ?? [] }]
    }),
  }
}

/**
 * The sofa seat heights, in the ERP's order (Maintenance's `sofa_sizes`): the
 * SKU Master's sofa columns, DEFAULT among them (2026-10-25 — a seat the ERP
 * sells, 8211's only one), and a new combo's price grid, which leaves DEFAULT out.
 */
export async function loadSofaSizes(): Promise<string[]> {
  const sb = await untyped()
  const rows = await all((f, t) =>
    sb
      .from('erp_maintenance_options')
      .select('value, sort_order, removed_at')
      .eq('erp_company_id', 1)
      .eq('pool', 'sofa_sizes')
      .order('sort_order')
      .order('value')
      .range(f, t),
  )
  return rows.filter(r => r.removed_at === null || r.removed_at === undefined).map(r => String(r.value))
}

// ─── Combo Pricing ──────────────────────────────────────────────────────────

export interface ComboRow {
  /** The row this line shows (`portal:<id>`); its (base model, slots, tier) is what the price is keyed on. */
  erpId: string
  baseModel: string
  modelName: string | null
  label: string | null
  slots: string[][]
  slotsKey: string
  tier: string | null
  /** The seat heights it is sold at. */
  heights: string[]
  effectiveFrom: string
  /** The portal's price per seat height. */
  prices: Record<string, number>
  isNew: boolean
}

/**
 * Every combo is the portal's own since 2026-10-08 (`catalogue_combos`): the
 * ERP's live ones were adopted that day (`erp_id`) and the ERP's mirror is no
 * longer read — one row per (base model, slots, tier), as the costing reads it.
 */
export async function loadCombos(): Promise<ComboRow[]> {
  const sb = await untyped()
  const [combos, prices, models, modelRows] = await Promise.all([
    all((f, t) =>
      sb
        .from('catalogue_combos')
        .select('id, base_model, modules, slots_key, tier, label, heights, effective_from, created_at, erp_id')
        .eq('erp_company_id', 1)
        .is('removed_at', null)
        .order('base_model')
        .order('id')
        .range(f, t),
    ),
    all((f, t) =>
      sb
        .from('catalogue_combo_prices')
        .select('base_model, slots_key, tier, price_by_height')
        .eq('erp_company_id', 1)
        .order('base_model')
        .order('slots_key')
        .order('tier')
        .range(f, t),
    ),
    all((f, t) =>
      sb.from('erp_product_models').select('erp_id, model_code, name, category').eq('category', 'SOFA').order('model_code').order('erp_id').range(f, t),
    ),
    all((f, t) => sb.from('catalogue_models').select('erp_model_id, model_name').order('erp_model_id').range(f, t)),
  ])
  const priceOf = new Map(
    prices.map(p => [`${p.base_model}\u0000${p.slots_key}\u0000${p.tier}`, p.price_by_height as Record<string, unknown>]),
  )
  const ownNames = ownNamesOf(modelRows)
  const nameOf = new Map(models.map(m => [String(m.model_code).toUpperCase(), ownNames.get(String(m.erp_id)) ?? str(m.name)]))

  const pricesOf = (c: Row): Record<string, number> => {
    const raw = priceOf.get(`${c.base_model}\u0000${c.slots_key}\u0000${c.tier ?? ''}`) ?? {}
    const out: Record<string, number> = {}
    for (const [h, v] of Object.entries(raw)) {
      const n = num(v)
      if (n !== null) out[h] = n
    }
    return out
  }
  // NEW = made here in the last 30 days; the sets adopted from the ERP were not.
  const recent = Date.now() - 30 * 86_400_000

  return combos
    .map(c => ({
      erpId: `portal:${c.id}`,
      baseModel: String(c.base_model),
      modelName: nameOf.get(String(c.base_model).toUpperCase()) ?? null,
      label: str(c.label),
      slots: normaliseComboModules(c.modules),
      slotsKey: String(c.slots_key),
      tier: str(c.tier),
      heights: Array.isArray(c.heights) ? (c.heights as unknown[]).map(String) : [],
      effectiveFrom: String(c.effective_from),
      prices: pricesOf(c),
      isNew: !c.erp_id && Date.parse(String(c.created_at)) > recent,
    }))
    .sort(
      (a, b) =>
        a.baseModel.localeCompare(b.baseModel, undefined, { numeric: true }) ||
        (a.label ?? '').localeCompare(b.label ?? '') ||
        (a.tier ?? '').localeCompare(b.tier ?? ''),
    )
}

// ─── Costing gaps ───────────────────────────────────────────────────────────

export type GapReason = 'not_in_sku_master' | 'unpriced' | 'no_height' | 'error' | string

export interface CostingGap {
  item_code: string
  item_group: string | null
  product_name: string | null
  brand_code: string | null
  lines: number
  bills: number
  qty: number
  revenue: number
  in_sku_master: boolean
  has_price: boolean
  reason: GapReason
  erp_product_id: string | null
}

/**
 * The codes sold in the window that nothing could price, worth-first. Through
 * an RPC because the answer is a GROUP BY over every line of two months.
 */
export async function loadCostingGaps(from: string, to: string): Promise<CostingGap[]> {
  const sb = await untyped()
  const { data, error } = await sb.rpc('revenue_costing_gaps', { p_from: from, p_to: to })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Row[]).map(r => ({
    item_code: String(r.item_code),
    item_group: str(r.item_group),
    product_name: str(r.product_name),
    brand_code: str(r.brand_code),
    lines: Number(r.lines ?? 0),
    bills: Number(r.bills ?? 0),
    qty: Number(r.qty ?? 0),
    revenue: Number(r.revenue ?? 0),
    in_sku_master: r.in_sku_master === true,
    has_price: r.has_price === true,
    reason: String(r.reason ?? 'unpriced'),
    erp_product_id: str(r.erp_product_id),
  }))
}

// ─── Costing Setting ────────────────────────────────────────────────────────
// Per sub-department (2026-09-27): it reads one scheme's rows. Written by
// `catalogue_save_cost_setting`. (Add-on / KPI Items, its neighbour until
// 2026-10-08, is Rules › KPI items now.)

export interface SchemeRules {
  /** Revenue Team cost = cost ÷ this (`comm_schemes.revenue_cost_divisor`). */
  divisor: number
}

export async function loadSchemeRules(schemeId: string): Promise<SchemeRules | null> {
  const sb = await untyped()
  const { data, error } = await sb
    .from('comm_schemes')
    .select('revenue_cost_divisor')
    .eq('id', schemeId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const row = data as Row
  return { divisor: num(row.revenue_cost_divisor) ?? 1 }
}

/** A SKU as Costing Setting's picker and table need it — no grid, no ticks. */
export interface PickSku {
  erpId: string
  code: string
  description: string | null
  category: string | null
  model: string | null
  /** The Product List cost: the SKU's one price, else its grid's lowest and highest. */
  price: number | null
  priceLow: number | null
  priceHigh: number | null
  active: boolean
  removed: boolean
}

export function toPickSku(s: CatalogueSku): PickSku {
  const cells = (s.grid ?? []).map(c => c.price).filter((p): p is number => typeof p === 'number')
  return {
    erpId: s.erpId,
    code: s.code,
    description: s.description,
    category: s.category,
    model: s.modelCode ?? s.modelName,
    price: s.price,
    priceLow: cells.length > 0 ? Math.min(...cells) : null,
    priceHigh: cells.length > 0 ? Math.max(...cells) : null,
    active: s.active,
    removed: s.removed,
  }
}

export interface CostRatioRow {
  erpId: string
  /** The code the ratio was set under: what a sales line has to carry. */
  code: string
  ratio: number
  updatedAt: string | null
}

export interface KivCostRow {
  size: KivSize
  cost: number
}

/** Costing Setting › KIV bed frames (2026-10-31): what a still-to-be-chosen frame of each size costs, every sub-department alike. */
export async function loadKivCosts(): Promise<KivCostRow[]> {
  const sb = await untyped()
  const { data, error } = await sb.from('catalogue_kiv_costs').select('size_code, cost').eq('erp_company_id', 1)
  if (error) throw new Error(error.message)
  return ((data ?? []) as Row[]).flatMap(r => {
    const size = str(r.size_code)
    const cost = num(r.cost)
    return isKivSize(size) && cost !== null ? [{ size, cost }] : []
  })
}

export async function loadCostRatios(schemeId: string): Promise<CostRatioRow[]> {
  const sb = await untyped()
  const rows = await all((f, t) =>
    sb
      .from('comm_cost_ratios')
      .select('erp_product_id, product_code, ratio, updated_at')
      .eq('scheme_id', schemeId)
      .order('product_code')
      .order('erp_product_id')
      .range(f, t),
  )
  return rows.map(r => ({
    erpId: String(r.erp_product_id),
    code: String(r.product_code),
    ratio: num(r.ratio) ?? 1,
    updatedAt: str(r.updated_at),
  }))
}
