/**
 * KPI items — what Rules › KPI items sets (the Product List's *Add-on / KPI
 * Items* tab until 2026-10-08: which items count as KPI is the pay's rule, not
 * a price), and how a bill is found to carry one (2026-09-27).
 *
 * A KPI item is a SKU from the SKU Master (a pillow, a protector) or a special
 * from Maintenance (a bed frame's *HB Straight*, a sofa's *Wooden Arm*), each
 * with ONE amount. When a bill carries it, that amount comes off the bill's
 * commissionable sales and is paid to the salesperson as a flat KPI allowance
 * instead (user 2026-09-27, "Flat KPI allowance"):
 *
 *   RM 10,000 bill with HB Straight at RM 200, rate 7%
 *     main   9,800 × 7% = 686.00   its margin judged on 9,800
 *     KPI    RM 200 flat            no margin applied, + the monthly
 *                                   quantity bonus (comm_kpi_thresholds)
 *
 * The ERP cannot say how much of a bill an add-on is — a bed frame line is
 * RM 0.00 on 96% of bills, its value folded into the mattress — so the amount
 * is the Principal's figure, not the line's. A bill pays its KPI items only
 * when its sales cover them (`coverKpi`).
 *
 * FOUND, not typed: a SKU by its product code; a special by the options the
 * line carries (`raw.variants`, else the ERP's own `description2` grammar —
 * `parseLineFacts`), in the pool's own category. A sofa prints its specials
 * on every module line, so a sofa special counts ONCE per bill; a bed frame
 * special counts per bed frame (line quantity) — two bed frames with HB
 * Straight are two add-ons. Hand-typed AutoCount-era text ("HEADBOARD DO
 * STRAIGHT") parses to nothing and is not found.
 *
 * A FABRIC SERIES (2026-10-29, user: "kpi item can selected with fabric
 * series as well. for sofa and bedframe") is the third kind: a bed frame's or
 * a sofa's, each its own item with its own amount. FOUND by the fabric the
 * line carries (`parseLineFacts().fabric` — `variants.fabricCode`, else the
 * first word of `description2`) looked up on the ERP's fabric list
 * (`erp_fabrics`: code → series), so a fabric keyed TBC on the ERP is found
 * the day the order comes back with its fabric. A bed frame's counts per bed
 * frame; a sofa's once per sofa SET (user: "Sofa 每组算一次") — the bill's
 * pieces of one model (its code before the first '-') in that series, as many
 * sets as its fewest pieces: two PC151 sofas on one bill are two.
 *
 * A BRAND'S OWN ITEM (2026-11-12 — a brand on its own commission scheme, 2990s;
 * the user: "这个 KPI item 是独立的，属于 2990 专属的 KPI item") is found only
 * on that brand's bills, which find none of the sub-department's
 * (`KpiItem.brandCode`, `brandOrderKpiHits`). Since 2026-11-14 it is picked as
 * the sub-department's own are (the user: "我只需要像 Fair 一样选 KPI 就好，不需要
 * 去选它的 cost"; "by model、by special 或者是 by compartment"), each of the
 * brand's own ERP company — 2990s' POS prices every bill, so what an item takes
 * OFF a bill's commissionable sales is what the bill CHARGED for it, and what it
 * PAYS is its bonus a unit, or its tier's by the month's units (`kpiUnitPay`:
 * 1–4 RM 50, 5–9 RM 70 → six are 6 × 70), whatever the sub-department's KPI
 * switch says (asked, the user: "扣掉再发 bonus"):
 *   a SKU            per unit; off: its line.
 *   a MODEL          the SKU master's base model of a line's SKU (`KpiLine.model`);
 *                    a sofa's once per sofa SET, any other's per unit; off: its lines.
 *   a COMPARTMENT    a sofa piece's module (`sofaModuleOf`: BOOQIT-CNR → CNR); once per
 *                    sofa SET that has one, however many (the user: "每组沙发算 1 个");
 *                    off: those pieces.
 *   a SPECIAL        found where a line names it, charged or not (the user, 2026-11-13:
 *                    "不需要去 detect 他有没有收钱"); a sofa's once per sofa SET, a bed
 *                    frame's per bed frame; off: what the line's special order charges
 *                    for it (`KpiLine.specialMoney`; a set's dearest copy).
 *   a FABRIC SERIES  its company's series of the line's fabric, else the fabric code's
 *                    family (`brandFabricSeriesOf`: 2990s' EZ-007 → EZ); off: nothing —
 *                    no bill charges for a series apart.
 * A piece is ONE whole item — its SKU's, else its model's, else its
 * compartment's (the more particular wins, as the POS's product rule beats its
 * category rule); specials and fabric series stack on it and are paid, but a
 * special on a sofa or a bed frame that comes off whole takes nothing more off:
 * its charge is in that money already. A line of a group that earns no
 * commission (a delivery) takes nothing off the commissionable sales. From
 * 2026-11-13 to 2026-11-14 an item had a cost and a corner cost typed on Rules
 * (the user: "only follow the cost set in venture"); none was ever set, and
 * nothing reads them now.
 *
 *   RM 3,240 bill (sofa 2,990 + Sofa Full Fabric 250), rate 4%, bonus RM 50
 *     main   2,990 × 4% = 119.60
 *     KPI    RM 50                    → RM 169.60
 *
 *   RM 5,500 corner sofa (2A 2,000 + CNR 1,500 + 2A 2,000), CNR an item at RM 30
 *     main   4,000 × 4% = 160.00
 *     KPI    RM 30                    → RM 190.00
 *
 * The twin of the SQL in migrations 20260927050000, 20261030010000,
 * 20261112200000, 20261114030000, 20261114040000, 20261114100000 and
 * 20261114230000 (`comm_kpi_hits`); the run, the month page, the member app and
 * the calculator must find the same items. The calculator's cart names no
 * fabric, so a quote finds no fabric series.
 */

import { valueKey } from '@/lib/catalogue/keys'
import { parseLineFacts } from '@/lib/catalogue/facts'

export const KPI_OPTION_POOLS = ['bedframe_specials', 'sofa_specials', 'bedframe_fabric_series', 'sofa_fabric_series'] as const
export type KpiOptionPool = (typeof KPI_OPTION_POOLS)[number]

export function isKpiOptionPool(pool: string): pool is KpiOptionPool {
  return (KPI_OPTION_POOLS as readonly string[]).includes(pool)
}

/**
 * The two pools only a brand's own item may be of (2026-11-14, `kpi_item_pool_is_a_brands`): a model of its SKU
 * master, a sofa compartment.
 */
export const KPI_BRAND_POOLS = ['models', 'compartments'] as const
export type KpiBrandPool = (typeof KPI_BRAND_POOLS)[number]
/** Any pool an option item may be of. */
export type KpiItemPool = KpiOptionPool | KpiBrandPool

export function isKpiItemPool(pool: string | null | undefined): pool is KpiItemPool {
  return typeof pool === 'string' && (isKpiOptionPool(pool) || (KPI_BRAND_POOLS as readonly string[]).includes(pool))
}

/** The two pools whose value is a fabric series, not a Maintenance special. */
export const KPI_FABRIC_POOLS = ['bedframe_fabric_series', 'sofa_fabric_series'] as const
export type KpiFabricPool = (typeof KPI_FABRIC_POOLS)[number]

export function isFabricSeriesPool(pool: string | null | undefined): pool is KpiFabricPool {
  return (KPI_FABRIC_POOLS as readonly (string | null | undefined)[]).includes(pool)
}

/** The ERP item group a pool belongs to. */
const POOL_GROUP: Record<KpiOptionPool, string> = {
  bedframe_specials: 'BEDFRAME',
  sofa_specials: 'SOFA',
  bedframe_fabric_series: 'BEDFRAME',
  sofa_fabric_series: 'SOFA',
}

/**
 * What a fabric series item is called wherever one is listed — the same series
 * may be a sofa's item and a bed frame's. `catalogue_save_kpi_items` stores it
 * as the item's name, so the member app's KPI card reads it too: keep the two
 * spellings the same.
 */
const FABRIC_LABEL: Record<KpiFabricPool, string> = {
  bedframe_fabric_series: 'Bed frame fabric',
  sofa_fabric_series: 'Sofa fabric',
}

export function fabricSeriesLabel(pool: KpiFabricPool, series: string): string {
  return `${series.trim()} · ${FABRIC_LABEL[pool]}`
}

export interface KpiItem {
  /** Absent = a SKU when it names a code (every row before 2026-09-27 was). */
  source?: 'sku' | 'option'
  /** SKU items: the ERP Item Code a line carries. */
  productCode?: string | null
  /**
   * Option items: which pool — a Maintenance special's, a fabric series', or (a brand's own alone, 2026-11-14) a
   * model's or a compartment's — and its own spelling.
   */
  optionPool?: KpiItemPool | null
  optionValue?: string | null
  /** What a person reads: the SKU's name, or the special. */
  label?: string | null
  /**
   * RM per unit — taken off the bill and paid as the KPI allowance. A brand's
   * own item: what a unit PAYS below its first tier (what comes off the bill is
   * what the bill charged for it — `brandOrderKpiHits`).
   */
  kpiAmount: number
  /**
   * The brand whose OWN item this is (2026-11-12 — a brand on its own
   * commission scheme, 2990s): its code as the brand list spells it. Absent =
   * the sub-department's own.
   */
  brandCode?: string | null
  /** A brand's own item alone: what a unit pays once the month's units reach a tier. */
  unitTiers?: readonly KpiUnitTier[]
}

/**
 * A sofa piece's module, as the costing reads a piece (`catalogue_apply_sofa_charges`): its code after its last '-',
 * no spaces, before its brackets — BOOQIT-CNR → CNR, XAMMAR-CNR (P) → CNR, 8030-2A(LHF) → 2A. A brand's own
 * compartment item is found by it (2026-11-14).
 */
export function sofaModuleOf(code: string | null | undefined): string {
  return kpiCodeKey(code).replace(/^.*-/, '').replace(/\s+/g, '').replace(/\(.*$/, '')
}

/** A step of a brand's own item (`comm_kpi_items.unit_tiers`): from `minQty` units in a month EVERY unit pays `amount`. */
export interface KpiUnitTier {
  minQty: number
  amount: number
}

/**
 * `comm_kpi_items.unit_tiers` as the engine reads it: `[{min_qty, amount}]`,
 * lowest first. A step that is not two numbers is left out (the column's
 * CHECK, `comm_kpi_unit_tiers_valid`, refuses one).
 */
export function toUnitTiers(raw: unknown): KpiUnitTier[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((step): KpiUnitTier[] => {
    if (!step || typeof step !== 'object') return []
    const { min_qty: minQty, amount } = step as { min_qty?: unknown; amount?: unknown }
    const [units, pay] = [Number(minQty), Number(amount)]
    return minQty !== null && amount !== null && Number.isFinite(units) && Number.isFinite(pay) && units > 0 && pay >= 0
      ? [{ minQty: units, amount: pay }]
      : []
  }).sort((a, b) => a.minQty - b.minQty)
}

/**
 * What a unit of the item pays in a month that counts `units` of it: its
 * amount — or, a brand's own item, the highest tier the units reach. The tier
 * is WHOLE (the user, 2026-11-12: six at "5-9 per units RM70" are 6 × RM 70,
 * not four at RM 50 and two at RM 70).
 */
export function kpiUnitPay(item: Pick<KpiItem, 'kpiAmount' | 'unitTiers'>, units: number): number {
  let pay = item.kpiAmount
  let reached = -Infinity
  for (const tier of item.unitTiers ?? []) {
    if (units + 1e-9 >= tier.minQty && tier.minQty > reached) {
      reached = tier.minQty
      pay = tier.amount
    }
  }
  return pay
}

/**
 * The specials a sales line carries, read the way `catalogue_line_facts` reads
 * them: the ERP's `raw.variants` when it sent them, else its `description2`
 * grammar. Only a bed frame's or a sofa's can be a KPI item, so nothing else
 * is read; undefined = none.
 */
export function lineSpecialsOf(
  itemGroup: string | null | undefined,
  description2: string | null | undefined,
  variants: unknown,
): string[] | undefined {
  const group = kpiCodeKey(itemGroup)
  if (group !== 'BEDFRAME' && group !== 'SOFA') return undefined
  const raw = variants === undefined || variants === null ? undefined : { variants }
  const { specials } = parseLineFacts(description2 ?? null, raw)
  return specials.length > 0 ? specials : undefined
}

/** A fabric on the ERP's fabric list, as far as finding its series needs it (`erp_fabrics`). */
export interface FabricSeriesRow {
  fabric_code: string
  series: string | null
  removed_at?: string | null
  active?: boolean | null
  synced_at?: string | null
  /** Whose list it is on (2026-11-14): absent = the ERP's first; a brand's own company's (2990s: 2) is a brand's. */
  erp_company_id?: number | string | null
}

/** Fabric code (`kpiCodeKey`) → its series. */
export type FabricSeriesIndex = ReadonlyMap<string, string>

export const EMPTY_FABRIC_SERIES: FabricSeriesIndex = new Map()

/**
 * The fabric list as `comm_kpi_hits` reads it: a code compared trimmed and in
 * any case, a fabric with no series left out, and where the ERP lists a code
 * twice the live row, then the active one, then the latest delivery's.
 */
export function indexFabricSeries(rows: readonly FabricSeriesRow[]): FabricSeriesIndex {
  const rank = (r: FabricSeriesRow) => [r.removed_at ? 0 : 1, r.active === false ? 0 : 1, r.synced_at ?? ''] as const
  const best = new Map<string, FabricSeriesRow>()
  for (const row of rows) {
    const code = kpiCodeKey(row.fabric_code)
    if (!code || !(row.series ?? '').trim()) continue
    const held = best.get(code)
    if (!held) {
      best.set(code, row)
      continue
    }
    const [a, b] = [rank(row), rank(held)]
    if (a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])))) best.set(code, row)
  }
  return new Map([...best].map(([code, row]) => [code, (row.series ?? '').trim()]))
}

/**
 * A brand's own company's fabric list (2026-11-14): a code → its series, '' for a fabric with none — where the ERP
 * lists a code twice, the live row, then the active one, then the latest delivery's, series or not (`comm_kpi_hits`'
 * brand_series picks the row first, then reads its series).
 */
export function indexFabricFamilies(rows: readonly FabricSeriesRow[]): FabricSeriesIndex {
  const rank = (r: FabricSeriesRow) => [r.removed_at ? 0 : 1, r.active === false ? 0 : 1, r.synced_at ?? ''] as const
  const best = new Map<string, FabricSeriesRow>()
  for (const row of rows) {
    const code = kpiCodeKey(row.fabric_code)
    if (!code) continue
    const held = best.get(code)
    if (!held) {
      best.set(code, row)
      continue
    }
    const [a, b] = [rank(row), rank(held)]
    if (a[0] > b[0] || (a[0] === b[0] && (a[1] > b[1] || (a[1] === b[1] && a[2] > b[2])))) best.set(code, row)
  }
  return new Map([...best].map(([code, row]) => [code, (row.series ?? '').trim()]))
}

/**
 * The series of a fabric on a brand's bill (2026-11-14): its series on the brand's own company's fabric list
 * (`indexFabricFamilies`), else its code's family — the code before the first '-' (2990s' EZ-007 → EZ, D-004 → D:
 * no series on the list; the POS names them so).
 */
export function brandFabricSeriesOf(fabric: string | null | undefined, families: FabricSeriesIndex): string | undefined {
  const code = kpiCodeKey(fabric)
  if (!code) return undefined
  return families.get(code) || (fabric ?? '').trim().split('-')[0].trim() || undefined
}

/**
 * The specials and the fabric series a sales line carries — what a bed frame's
 * or a sofa's KPI items are found by. The line's facts read once, the way
 * `catalogue_line_facts` reads them; its fabric's series from the fabric list —
 * a brand's bill's (`brandFamilies`, 2026-11-14), from its own company's list,
 * else its code's family.
 */
export function lineKpiFactsOf(
  itemGroup: string | null | undefined,
  description2: string | null | undefined,
  variants: unknown,
  fabrics: FabricSeriesIndex = EMPTY_FABRIC_SERIES,
  brandFamilies?: FabricSeriesIndex,
): { specials?: string[]; fabricSeries?: string } {
  const group = kpiCodeKey(itemGroup)
  if (group !== 'BEDFRAME' && group !== 'SOFA') return {}
  const raw = variants === undefined || variants === null ? undefined : { variants }
  const { specials, fabric } = parseLineFacts(description2 ?? null, raw)
  const fabricSeries = brandFamilies
    ? brandFabricSeriesOf(fabric, brandFamilies)
    : fabric && fabrics.size > 0 ? fabrics.get(kpiCodeKey(fabric)) : undefined
  return {
    ...(specials.length > 0 ? { specials } : {}),
    ...(fabricSeries ? { fabricSeries } : {}),
  }
}

/** A line as far as finding KPI items needs it. */
export interface KpiLine {
  id: string
  itemGroup: string
  productCode: string
  productName?: string
  qty: number
  /**
   * What the line charged (2026-11-14): what a brand's own SKU, model or compartment takes off its bill. Absent = 0.
   */
  lineAmount?: number
  /**
   * The base model of the line's SKU on the brand's own SKU master (2026-11-14, `erp_products.base_model`): what a
   * brand's own model item is found by. Loaded for the bills of a brand with a model item; absent = none.
   */
  model?: string
  /** The specials the line carries, as printed (`LineFacts.specials`). */
  specials?: readonly string[]
  /** The series of the fabric the line carries (`lineKpiFactsOf`). */
  fabricSeries?: string
  /**
   * What the line's special order charges for each special (2026-11-12): the
   * special's name (`valueKey`) → RM, only those charged above nothing — the
   * ERP's `custom_specials` on the delivered item, read by
   * `sales_order_special_money`. A sofa set's surcharge is on every piece.
   * Loaded for the bills of a brand with KPI items of its own; absent = none.
   */
  specialMoney?: Readonly<Record<string, number>>
  upsale?: boolean
}

export interface KpiIndex {
  byCode: ReadonlyMap<string, KpiItem>
  /** Pool → option value key → item. */
  byOption: ReadonlyMap<KpiItemPool, ReadonlyMap<string, KpiItem>>
  size: number
  /** A brand's own items (`indexBrandKpiItems`): found and taken off as a brand's are (`brandOrderKpiHits`). */
  brand?: boolean
}

export const EMPTY_KPI_INDEX: KpiIndex = { byCode: new Map(), byOption: new Map(), size: 0 }

/** Codes are compared the way the engine compares them: trimmed, upper case. */
export function kpiCodeKey(code: string | null | undefined): string {
  return (code ?? '').trim().toUpperCase()
}

export function kpiSourceOf(item: Pick<KpiItem, 'source' | 'optionPool'>): 'sku' | 'option' {
  return item.source ?? (item.optionPool ? 'option' : 'sku')
}

/**
 * A stable key for one item, for summaries and React keys. A brand's own item
 * is not the sub-department's of the same special: its key says whose it is.
 */
export function kpiItemKey(item: Pick<KpiItem, 'source' | 'productCode' | 'optionPool' | 'optionValue' | 'brandCode'>): string {
  const key = kpiSourceOf(item) === 'sku'
    ? `sku:${kpiCodeKey(item.productCode)}`
    : `option:${item.optionPool}:${valueKey(item.optionValue) ?? ''}`
  const brand = kpiCodeKey(item.brandCode)
  return brand ? `brand:${brand}:${key}` : key
}

export function kpiItemLabel(item: KpiItem): string {
  const own = (item.label ?? '').trim()
  if (own) return own
  if (kpiSourceOf(item) === 'sku') return kpiCodeKey(item.productCode)
  const value = (item.optionValue ?? '').trim()
  return isFabricSeriesPool(item.optionPool) ? fabricSeriesLabel(item.optionPool, value) : value
}

const OPTION_KINDS: Record<KpiItemPool, { kind: string; counted: string }> = {
  bedframe_specials: { kind: 'Bed frame special', counted: 'Per bed frame' },
  sofa_specials: { kind: 'Sofa special', counted: 'Once per sofa bill' },
  bedframe_fabric_series: { kind: 'Bed frame fabric series', counted: 'Per bed frame' },
  sofa_fabric_series: { kind: 'Sofa fabric series', counted: 'Once per sofa set' },
  // A brand's own alone (2026-11-14).
  models: { kind: 'Model', counted: 'Once per sofa set, else per unit' },
  compartments: { kind: 'Compartment', counted: 'Once per sofa set' },
}

/** What an item is, and how a bill counts it — the words the tabs print. */
export function kpiItemKind(item: Pick<KpiItem, 'source' | 'optionPool' | 'brandCode'>): { kind: string; counted: string } {
  if (kpiSourceOf(item) === 'sku') return { kind: 'SKU', counted: 'Per unit' }
  // A brand's own sofa special is counted as a fabric series is: a unit a sofa.
  if (kpiCodeKey(item.brandCode) && item.optionPool === 'sofa_specials') return { kind: 'Sofa special', counted: 'Once per sofa set' }
  return (item.optionPool && OPTION_KINDS[item.optionPool]) || OPTION_KINDS.bedframe_specials
}

/**
 * The sub-department's OWN items, indexed. A brand's own item (`brandCode`) is
 * never among them — it is found on its brand's bills alone
 * (`indexBrandKpiItems`).
 */
export function indexKpiItems(items: readonly KpiItem[]): KpiIndex {
  return buildIndex(items.filter(item => !kpiCodeKey(item.brandCode)))
}

/**
 * Each brand's own items (2026-11-12): the brand's code (`kpiCodeKey`) → its
 * index — since 2026-11-14 of every kind (a SKU, a model, a compartment, a
 * special, a fabric series), found as a brand's are (`brandOrderKpiHits`).
 */
export function indexBrandKpiItems(items: readonly KpiItem[]): ReadonlyMap<string, KpiIndex> {
  const byBrand = new Map<string, KpiItem[]>()
  for (const item of items) {
    const brand = kpiCodeKey(item.brandCode)
    if (!brand) continue
    byBrand.set(brand, [...(byBrand.get(brand) ?? []), item])
  }
  return new Map([...byBrand].map(([brand, list]) => [brand, { ...buildIndex(list), brand: true }]))
}

function buildIndex(items: readonly KpiItem[]): KpiIndex {
  const byCode = new Map<string, KpiItem>()
  const byOption = new Map<KpiItemPool, Map<string, KpiItem>>()
  let size = 0
  for (const item of items) {
    if (kpiSourceOf(item) === 'sku') {
      const code = kpiCodeKey(item.productCode)
      if (!code || byCode.has(code)) continue
      byCode.set(code, item)
      size++
    } else if (item.optionPool && isKpiItemPool(item.optionPool)) {
      const key = valueKey(item.optionValue)
      if (!key) continue
      const pool = byOption.get(item.optionPool) ?? new Map<string, KpiItem>()
      if (pool.has(key)) continue
      pool.set(key, item)
      byOption.set(item.optionPool, pool)
      size++
    }
  }
  return { byCode, byOption, size }
}

/**
 * The item a printed special is, in one pool. Exact first, then without a
 * trailing "(…)" — `Right Drawer (10")` is the pool's `Right Drawer` — the
 * rule the surcharge lookup uses (`OptionPrices.get`, `catalogue_option_price`).
 */
function optionFor(special: string, pool: ReadonlyMap<string, KpiItem>): KpiItem | undefined {
  const exact = valueKey(special)
  if (exact && pool.has(exact)) return pool.get(exact)
  const stripped = valueKey(special.replace(/\s*\(.*\)\s*$/, ''))
  return stripped ? pool.get(stripped) : undefined
}

export interface KpiHit {
  item: KpiItem
  itemKey: string
  /** The line that carries it — the first such line for a once-a-bill special. */
  lineId: string
  qty: number
  /**
   * What it takes OFF the bill's commissionable sales: qty × the item's amount
   * — a brand's own item, what the bill charged for it (`brandOrderKpiHits`).
   */
  amount: number
  /**
   * The allowance the bill pays for it: qty × the item's amount. The same as
   * `amount` for the sub-department's own item; a brand's own item's, before
   * its month's tier (`kpiUnitPay` — the run pays qty × that).
   */
  paid: number
}

/** A bill as far as finding its KPI items needs it. */
export interface KpiOrder {
  lines: readonly KpiLine[]
  upsale?: boolean
  /** With `share`, which part of a shared bill this is. */
  staffId?: string
  /** A shared bill's holders, as each of its parts carries them (`BillShare`). */
  share?: { parts: readonly { staffId: string; pct: number }[] }
}

/**
 * The part of the whole bill these lines are — a shared bill's parts carry
 * their lines scaled (`splitOrdersByShares`: quantity and amount × the part) —
 * else 1.
 */
function billPartOf(order: KpiOrder): number {
  const pct = order.share?.parts.find(part => part.staffId === order.staffId)?.pct
  return pct !== undefined && pct > 0 && pct < 1 ? pct : 1
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * The sofa a piece belongs to on a bill, as a fabric series counts it: the
 * model its code names before the first '-' (8030-1A(LHF) → 8030), else the
 * line on its own — `comm_kpi_hits`' SPLIT_PART.
 */
function sofaModelOf(line: KpiLine): string {
  return kpiCodeKey(line.productCode).split('-')[0] || `line:${line.id}`
}

/** A sofa's pieces of one model that carry one item, as they are counted into sets. */
interface SofaSet {
  item: KpiItem
  itemKey: string
  lineId: string
  sum: number
  fewest: number
  /** A brand's own item: what comes off — Σ its pieces' money (a model's, a compartment's), else its dearest charge. */
  money: number
}

/** As many sets as a sofa's fewest pieces (×2 everywhere = two sofas), its sign the sofa's — this part of them. */
function setsOf(set: { sum: number; fewest: number }, part: number): number {
  return Math.sign(set.sum) * Math.max(1, Math.floor(set.fewest / part + 1e-9)) * part
}

/** Whether a line's group earns commission (`classifyLine`'s commissionable) — absent = every group does. */
export type CommissionableGroup = (itemGroup: string) => boolean

/**
 * Every KPI item a bill carries. An upsale HR recorded is never one.
 *
 * A part of a shared bill carries its PART of a unit counted once a bill or
 * once a sofa set — a brand's own item (2026-11-12), and since 2026-11-13 the
 * sub-department's own sofa special and fabric-series set too: half a bill,
 * half the unit, half its amount — the parts add back up to the bill's own
 * count, as `member_order_facts` counts them (qty × part). Until then each
 * holder of a shared bill was given the sub-department's whole unit; nobody
 * was, in fact — its KPI switch went on that day with no such bill shared.
 * A unit counted by quantity (a SKU, a bed frame's special or fabric series)
 * is its part already: a part's lines carry their quantities scaled.
 *
 * A brand's own items (`index.brand`) are found as `brandOrderKpiHits` finds
 * them; `commissionable` says which groups' money a brand's whole item takes off.
 */
export function orderKpiHits(order: KpiOrder, index: KpiIndex, commissionable?: CommissionableGroup): KpiHit[] {
  if (index.size === 0 || order.upsale) return []
  if (index.brand) return brandOrderKpiHits(order, index, commissionable)
  const hits: KpiHit[] = []
  const own = (item: KpiItem, lineId: string, qty: number): KpiHit => {
    const amount = round2(qty * item.kpiAmount)
    return { item, itemKey: kpiItemKey(item), lineId, qty, amount, paid: amount }
  }
  // Once-a-bill specials (a sofa's): item key → the hit being built.
  const perBill = new Map<string, { item: KpiItem; lineId: string; qty: number }>()
  // Once per sofa set — a sofa's fabric series: model + item key → its pieces.
  const perSet = new Map<string, SofaSet>()
  const intoSet = (line: KpiLine, item: KpiItem) => {
    const key = kpiItemKey(item)
    const setKey = `${sofaModelOf(line)}\u0000${key}`
    const set = perSet.get(setKey) ?? { item, itemKey: key, lineId: line.id, sum: 0, fewest: Infinity, money: 0 }
    set.sum += line.qty
    set.fewest = Math.min(set.fewest, Math.abs(line.qty))
    perSet.set(setKey, set)
  }

  for (const line of order.lines) {
    if (line.upsale) continue
    const sku = index.byCode.get(kpiCodeKey(line.productCode))
    if (sku) hits.push(own(sku, line.id, line.qty))
    const group = kpiCodeKey(line.itemGroup)
    const series = valueKey(line.fabricSeries)
    if (series) {
      for (const poolName of KPI_FABRIC_POOLS) {
        if (POOL_GROUP[poolName] !== group) continue
        const item = index.byOption.get(poolName)?.get(series)
        if (!item) continue
        if (poolName === 'bedframe_fabric_series') hits.push(own(item, line.id, line.qty))
        else intoSet(line, item)
      }
    }
    if (!line.specials?.length) continue
    for (const poolName of ['bedframe_specials', 'sofa_specials'] as const) {
      const pool = index.byOption.get(poolName)
      if (!pool || POOL_GROUP[poolName] !== group) continue
      // One line may print a special twice; it is still one add-on.
      const seen = new Set<KpiItem>()
      for (const special of line.specials) {
        const item = optionFor(special, pool)
        if (!item || seen.has(item)) continue
        seen.add(item)
        if (poolName === 'sofa_specials') {
          const key = kpiItemKey(item)
          // The sign of the sofa's quantity decides: a return takes it back.
          const hit = perBill.get(key) ?? { item, lineId: line.id, qty: 0 }
          hit.qty += line.qty
          perBill.set(key, hit)
        } else {
          hits.push(own(item, line.id, line.qty))
        }
      }
    }
  }

  // A shared bill's part: its part of each unit counted once a bill or once a set.
  const part = billPartOf(order)
  for (const hit of perBill.values()) {
    const qty = Math.sign(hit.qty) * part
    if (qty === 0) continue
    hits.push(own(hit.item, hit.lineId, qty))
  }
  // The whole bill's sets (a part's pieces carry their quantities scaled), then this part of them: a return takes
  // them back, an exchange of a piece is none.
  for (const set of perSet.values()) {
    const qty = setsOf(set, part)
    if (qty !== 0) hits.push(own(set.item, set.lineId, qty))
  }
  return hits
}

/** A piece's whole item on a brand's bill: its SKU's, else its model's, else its compartment's. */
interface WholeItem {
  item: KpiItem
  pool: 'sku' | 'models' | 'compartments'
}

/**
 * Every item of a brand's OWN a bill of that brand carries (2026-11-14 — the twin of `comm_kpi_hits`' brand part,
 * 20261114230000; the user: "扣掉再发 bonus", a compartment "每组沙发算 1 个"). Each hit's `amount` is what the bill
 * charged for the item — of its commissionable sales: a line of a group that earns nothing takes nothing off — and
 * its `paid` the item's bonus a unit (the run pays the month's tier):
 *   a SKU                 per unit, its line;
 *   a model               a sofa's once per sofa set, its pieces; any other's per unit, its line;
 *   a compartment         once per sofa set that has one (its sets), those pieces;
 *   a sofa special        once per sofa set, the set's dearest charge for it — nothing where a piece of the sofa
 *                         comes off whole;
 *   a bed frame special   per bed frame, its charge — nothing where the bed frame comes off whole;
 *   a fabric series       a bed frame's per bed frame, a sofa's once per sofa set; nothing off.
 * A piece is ONE whole item: its SKU's, else its model's, else its compartment's.
 */
function brandOrderKpiHits(order: KpiOrder, index: KpiIndex, commissionable?: CommissionableGroup): KpiHit[] {
  const lines = order.lines.filter(line => !line.upsale)
  const part = billPartOf(order)
  const hits: KpiHit[] = []
  const hit = (item: KpiItem, lineId: string, qty: number, off: number): KpiHit => ({
    item, itemKey: kpiItemKey(item), lineId, qty, amount: round2(off), paid: round2(qty * item.kpiAmount),
  })
  // What a line charged, as far as it is commissionable sales.
  const moneyOf = (line: KpiLine) => (commissionable && !commissionable(line.itemGroup) ? 0 : line.lineAmount ?? 0)
  const isSofa = (line: KpiLine) => kpiCodeKey(line.itemGroup) === 'SOFA'

  // Each piece's whole item — the more particular wins.
  const whole = new Map<string, WholeItem>()
  for (const line of lines) {
    const sku = index.byCode.get(kpiCodeKey(line.productCode))
    const model = line.model ? index.byOption.get('models')?.get(valueKey(line.model) ?? '') : undefined
    const compartment = isSofa(line) ? index.byOption.get('compartments')?.get(valueKey(sofaModuleOf(line.productCode)) ?? '') : undefined
    if (sku) whole.set(line.id, { item: sku, pool: 'sku' })
    else if (model) whole.set(line.id, { item: model, pool: 'models' })
    else if (compartment) whole.set(line.id, { item: compartment, pool: 'compartments' })
  }
  // The sofas a piece of which comes off whole: a special on them takes nothing more off.
  const wholeSofas = new Set(lines.filter(line => whole.has(line.id)).map(sofaModelOf))
  // Every sofa on the bill, all its pieces: a compartment counts its sets.
  const sofas = new Map<string, { sum: number; fewest: number }>()
  for (const line of lines.filter(isSofa)) {
    const sofa = sofas.get(sofaModelOf(line)) ?? { sum: 0, fewest: Infinity }
    sofa.sum += line.qty
    sofa.fewest = Math.min(sofa.fewest, Math.abs(line.qty))
    sofas.set(sofaModelOf(line), sofa)
  }

  // Counted once a sofa set — a model's sofa pieces, a compartment, a sofa special, a sofa fabric series: sofa + pool +
  // item → its pieces.
  const perSet = new Map<string, SofaSet & { sofa: string; pool: string }>()
  const intoSet = (line: KpiLine, pool: string, item: KpiItem, money: number, dearest = false) => {
    const sofa = sofaModelOf(line)
    const key = `${sofa}\u0000${pool}\u0000${kpiItemKey(item)}`
    const set = perSet.get(key) ?? { item, itemKey: kpiItemKey(item), lineId: line.id, sum: 0, fewest: Infinity, money: 0, sofa, pool }
    set.sum += line.qty
    set.fewest = Math.min(set.fewest, Math.abs(line.qty))
    set.money = dearest ? Math.max(set.money, money) : set.money + money
    perSet.set(key, set)
  }

  for (const line of lines) {
    const group = kpiCodeKey(line.itemGroup)
    const found = whole.get(line.id)
    if (found) {
      // A SKU, and a model's piece that is no sofa's, per unit at its line; a sofa's piece into its sofa.
      if (found.pool === 'sku' || (found.pool === 'models' && !isSofa(line))) {
        hits.push(hit(found.item, line.id, line.qty, line.qty !== 0 ? moneyOf(line) : 0))
      } else {
        intoSet(line, found.pool, found.item, moneyOf(line))
      }
    }
    // A fabric series: nothing off — no bill charges for a series apart.
    const series = valueKey(line.fabricSeries)
    if (series && (group === 'BEDFRAME' || group === 'SOFA')) {
      const pool = group === 'BEDFRAME' ? 'bedframe_fabric_series' : 'sofa_fabric_series'
      const item = index.byOption.get(pool)?.get(series)
      if (item && group === 'BEDFRAME') hits.push(hit(item, line.id, line.qty, 0))
      else if (item) intoSet(line, pool, item, 0)
    }
    // A special the line names, charged or not (the user, 2026-11-13: the price is sometimes written in the remark)
    // — with what this line's special order charges for it, its dearest spelling's.
    if (!line.specials?.length || (group !== 'BEDFRAME' && group !== 'SOFA')) continue
    const pool = group === 'BEDFRAME' ? 'bedframe_specials' : 'sofa_specials'
    const specials = index.byOption.get(pool)
    if (!specials) continue
    const named = new Map<KpiItem, number>()
    for (const special of line.specials) {
      const item = optionFor(special, specials)
      if (!item) continue
      const money = Math.max(0, line.specialMoney?.[valueKey(special) ?? ''] ?? 0)
      named.set(item, Math.max(named.get(item) ?? 0, money))
    }
    for (const [item, money] of named) {
      if (group === 'BEDFRAME') hits.push(hit(item, line.id, line.qty, whole.has(line.id) ? 0 : line.qty * money))
      else intoSet(line, pool, item, money, true)
    }
  }

  for (const set of perSet.values()) {
    // A compartment counts the sofa's sets, all its pieces; every other kind the sets of its own pieces.
    const qty = set.pool === 'compartments' ? setsOf(sofas.get(set.sofa) ?? set, part) : setsOf(set, part)
    if (qty === 0) continue
    const off = set.pool === 'sofa_specials'
      ? wholeSofas.has(set.sofa) ? 0 : qty * set.money
      : set.money
    hits.push(hit(set.item, set.lineId, qty, off))
  }
  return hits
}

/** What the bill's KPI items pay, each at its item's amount (a brand's own, before its month's tier). */
export function kpiPaidOf(hits: readonly KpiHit[]): number {
  return round2(hits.reduce((sum, hit) => sum + hit.paid, 0))
}

/** What the bill's KPI items take off its commissionable sales. */
export function kpiAmountOf(hits: readonly KpiHit[]): number {
  return round2(hits.reduce((sum, hit) => sum + hit.amount, 0))
}

/**
 * Whether a bill's sales COVER its KPI items, and its main sales.
 *
 * The KPI part is part of the bill: its amount comes out of the bill's
 * commissionable sales. A bill whose sales do not cover it — a RM 0.00
 * exchange that still prints the sofa's specials (two in September 2026) —
 * sold no add-on: none of its KPI items is paid, and it is paid as the sales
 * it has. Not a run warning: every warning blocks Apply, and an exchange is
 * not an error to be fixed before payroll.
 */
export function coverKpi(commissionable: number, kpiAmount: number): { main: number; covered: boolean } {
  const main = round2(commissionable - kpiAmount)
  const covered = commissionable >= 0 ? main >= 0 : main <= 0
  return covered ? { main, covered } : { main: round2(commissionable), covered }
}
