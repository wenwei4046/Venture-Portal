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
 * the user: "这个 KPI item 是独立的，属于 2990 专属的 KPI item") is the fourth:
 * a SOFA SPECIAL of that brand's (`KpiItem.brandCode`), found only on that
 * brand's bills — which find none of the sub-department's — wherever a piece
 * of the sofa NAMES it, charged or not (the user, 2026-11-13: "不需要去 detect
 * 他有没有收钱" — the price is sometimes written in the remark and the
 * special's own amount left empty; until then it was found only where the
 * special order charged for it). It differs in the money: what comes OFF the
 * bill is the item's COST a unit, set on Rules › KPI items (`KpiItem.cost` — the
 * user, the same evening, told that an upgrade priced in the remark would earn
 * the whole bill's commission and the bonus: "i need a place at kpi item rules
 * set there fill in cost, so that it can dedecut the cost out and change to kpi
 * amount only"; a brand on its own scheme has no Product List to price an
 * upgrade on) — or what the bill charged for the special when that is more
 * (`KpiLine.specialMoney`: the ERP's special order on the line; a corner sofa
 * charged double) — "升级的钱只拿 bonus". An item with no cost takes off what
 * the bill charged alone, nothing where it charges nothing. What is PAID is the
 * item's amount a unit — or its tier's, by the month's units (`kpiUnitPay`:
 * 1–4 RM 50, 5–9 RM 70 → six are 6 × 70). Counted once per sofa SET, as a
 * fabric series is. Paid whatever the sub-department's own KPI switch says.
 *
 *   RM 3,240 bill (sofa 2,990 + Sofa Full Fabric 250), rate 4%, bonus RM 50
 *     main   2,990 × 4% = 119.60
 *     KPI    RM 50                    → RM 169.60
 *
 *   RM 3,490 bill, Latex Seat named and its RM 500 written in the remark
 *   (the special order charges nothing), cost RM 500, rate 4%, bonus RM 50
 *     main   2,990 × 4% = 119.60
 *     KPI    RM 50                    → RM 169.60   (RM 189.60 with no cost)
 *
 * The twin of the SQL in migrations 20260927050000, 20261030010000 and
 * 20261112200000 (`comm_kpi_hits`); the run, the month page, the member app
 * and the calculator must find the same items. The calculator's cart names no
 * fabric, so a quote finds no fabric series.
 */

import { valueKey } from '@/lib/catalogue/keys'
import { parseLineFacts } from '@/lib/catalogue/facts'

export const KPI_OPTION_POOLS = ['bedframe_specials', 'sofa_specials', 'bedframe_fabric_series', 'sofa_fabric_series'] as const
export type KpiOptionPool = (typeof KPI_OPTION_POOLS)[number]

export function isKpiOptionPool(pool: string): pool is KpiOptionPool {
  return (KPI_OPTION_POOLS as readonly string[]).includes(pool)
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
  /** Option items: which pool — a Maintenance special's or a fabric series' — and its own spelling. */
  optionPool?: KpiOptionPool | null
  optionValue?: string | null
  /** What a person reads: the SKU's name, or the special. */
  label?: string | null
  /**
   * RM per unit — taken off the bill and paid as the KPI allowance. A brand's
   * own item: what a unit PAYS below its first tier (what comes off the bill is
   * what the bill charged).
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
  /**
   * A brand's own item alone (2026-11-13, `comm_kpi_items.cost_amount`): RM a
   * unit taken OFF the bill's commissionable sales — the upgrade's price, set on
   * Rules › KPI items, whatever the bill's special order says of it (its price
   * is sometimes written in the remark). A special order charging MORE takes
   * that off instead (`kpiUnitOff`). Absent, null or 0 = no cost: what the
   * special order charges alone.
   */
  cost?: number | null
}

/** A brand's own item's cost a unit; 0 = none set. */
export function kpiItemCost(item: Pick<KpiItem, 'cost'>): number {
  const cost = Number(item.cost ?? 0)
  return Number.isFinite(cost) && cost > 0 ? cost : 0
}

/**
 * What a unit of a brand's own item takes off its bill: the item's cost, or
 * what the bill's special order charges for it when that is more — never less
 * than the rule says, so an amount left empty or typed short pays no commission
 * on the upgrade's money (补钱容易、扣钱难), and a dearer one (a corner sofa's)
 * is taken off whole. The twin of `comm_kpi_hits`' GREATEST.
 */
export function kpiUnitOff(item: Pick<KpiItem, 'cost'>, charged: number): number {
  return Math.max(charged > 0 ? charged : 0, kpiItemCost(item))
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
 * The specials and the fabric series a sales line carries — what a bed frame's
 * or a sofa's KPI items are found by. The line's facts read once, the way
 * `catalogue_line_facts` reads them; its fabric's series from the fabric list.
 */
export function lineKpiFactsOf(
  itemGroup: string | null | undefined,
  description2: string | null | undefined,
  variants: unknown,
  fabrics: FabricSeriesIndex = EMPTY_FABRIC_SERIES,
): { specials?: string[]; fabricSeries?: string } {
  const group = kpiCodeKey(itemGroup)
  if (group !== 'BEDFRAME' && group !== 'SOFA') return {}
  const raw = variants === undefined || variants === null ? undefined : { variants }
  const { specials, fabric } = parseLineFacts(description2 ?? null, raw)
  const fabricSeries = fabric && fabrics.size > 0 ? fabrics.get(kpiCodeKey(fabric)) : undefined
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
  byOption: ReadonlyMap<KpiOptionPool, ReadonlyMap<string, KpiItem>>
  size: number
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

const OPTION_KINDS: Record<KpiOptionPool, { kind: string; counted: string }> = {
  bedframe_specials: { kind: 'Bed frame special', counted: 'Per bed frame' },
  sofa_specials: { kind: 'Sofa special', counted: 'Once per sofa bill' },
  bedframe_fabric_series: { kind: 'Bed frame fabric series', counted: 'Per bed frame' },
  sofa_fabric_series: { kind: 'Sofa fabric series', counted: 'Once per sofa set' },
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
 * index. A brand's item is a sofa special (`kpi_item_brand_kinds`); anything
 * else stored for a brand is found on no bill.
 */
export function indexBrandKpiItems(items: readonly KpiItem[]): ReadonlyMap<string, KpiIndex> {
  const byBrand = new Map<string, KpiItem[]>()
  for (const item of items) {
    const brand = kpiCodeKey(item.brandCode)
    if (!brand || kpiSourceOf(item) !== 'option' || item.optionPool !== 'sofa_specials') continue
    byBrand.set(brand, [...(byBrand.get(brand) ?? []), item])
  }
  return new Map([...byBrand].map(([brand, list]) => [brand, buildIndex(list)]))
}

function buildIndex(items: readonly KpiItem[]): KpiIndex {
  const byCode = new Map<string, KpiItem>()
  const byOption = new Map<KpiOptionPool, Map<string, KpiItem>>()
  let size = 0
  for (const item of items) {
    if (kpiSourceOf(item) === 'sku') {
      const code = kpiCodeKey(item.productCode)
      if (!code || byCode.has(code)) continue
      byCode.set(code, item)
      size++
    } else if (item.optionPool && isKpiOptionPool(item.optionPool)) {
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
   * — a brand's own item, qty × its cost, or what the bill charged for it when
   * that is more (`kpiUnitOff`).
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
  /** A brand's own item: the dearest copy of what the set's special order charges for it. */
  charged: number
}

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
 */
export function orderKpiHits(order: KpiOrder, index: KpiIndex): KpiHit[] {
  if (index.size === 0 || order.upsale) return []
  const hits: KpiHit[] = []
  const own = (item: KpiItem, lineId: string, qty: number): KpiHit => {
    const amount = round2(qty * item.kpiAmount)
    return { item, itemKey: kpiItemKey(item), lineId, qty, amount, paid: amount }
  }
  // Once-a-bill specials (a sofa's): item key → the hit being built.
  const perBill = new Map<string, { item: KpiItem; lineId: string; qty: number }>()
  // Once per sofa set — a sofa's fabric series, and a brand's own sofa special: model + item key → its pieces.
  const perSet = new Map<string, SofaSet>()
  const intoSet = (line: KpiLine, item: KpiItem, charged = 0) => {
    const key = kpiItemKey(item)
    const setKey = `${sofaModelOf(line)}\u0000${key}`
    const set = perSet.get(setKey) ?? { item, itemKey: key, lineId: line.id, sum: 0, fewest: Infinity, charged: 0 }
    set.sum += line.qty
    set.fewest = Math.min(set.fewest, Math.abs(line.qty))
    set.charged = Math.max(set.charged, charged)
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
    for (const [poolName, pool] of index.byOption) {
      if (POOL_GROUP[poolName] !== group || isFabricSeriesPool(poolName)) continue
      // One line may print a special twice; it is still one add-on.
      const seen = new Set<KpiItem>()
      // A brand's own item the line names → what this line's special order charges for it (its dearest
      // spelling's), nothing when it charges nothing.
      const named = new Map<KpiItem, number>()
      for (const special of line.specials) {
        const item = optionFor(special, pool)
        if (!item) continue
        if (kpiCodeKey(item.brandCode)) {
          const money = Math.max(0, line.specialMoney?.[valueKey(special) ?? ''] ?? 0)
          named.set(item, Math.max(named.get(item) ?? 0, money))
          continue
        }
        if (seen.has(item)) continue
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
      // Found where the line names it, charged or not (the user, 2026-11-13: the price is sometimes written in
      // the remark and the special's own amount left empty) — what it charged, if anything, comes off the bill.
      for (const [item, money] of named) intoSet(line, item, money)
    }
  }

  // A shared bill's part: its part of each unit counted once a bill or once a set.
  const part = billPartOf(order)
  for (const hit of perBill.values()) {
    const qty = Math.sign(hit.qty) * part
    if (qty === 0) continue
    hits.push(own(hit.item, hit.lineId, qty))
  }
  // As many sets as the sofa's fewest pieces (×2 everywhere = two sofas), its
  // sign the sofa's: a return takes them back, an exchange of a piece is none.
  // The whole bill's sets (a part's pieces carry their quantities scaled), then this part of them.
  for (const set of perSet.values()) {
    const qty = Math.sign(set.sum) * Math.max(1, Math.floor(set.fewest / part + 1e-9)) * part
    if (qty === 0) continue
    if (!kpiCodeKey(set.item.brandCode)) {
      hits.push(own(set.item, set.lineId, qty))
      continue
    }
    // A brand's own item: its cost — what the bill charged, when that is more — comes off its sales, the item's
    // amount a unit is what it pays.
    hits.push({
      item: set.item, itemKey: set.itemKey, lineId: set.lineId, qty,
      amount: round2(qty * kpiUnitOff(set.item, set.charged)), paid: round2(qty * set.item.kpiAmount),
    })
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
