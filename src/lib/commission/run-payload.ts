/**
 * Between the database and the engine.
 *
 * The engine (engine.ts) is pure and knows nothing about Postgres; the Server
 * Action (revenue/run-actions.ts) knows nothing about commission
 * maths. This file is the seam, and it is pure so the mapping can be tested —
 * which matters more than it sounds, because a mapping slip here does not throw,
 * it quietly pays the wrong person the wrong amount.
 *
 * Two directions:
 *   rows  → EngineInput   (toEngineInput)
 *   result → RPC payload  (toRunPayload, snake_case for save_commission_run)
 *
 * Three things the mapping has to get right, all of which are business rules
 * rather than plumbing:
 *
 *  1. **Effective-dated config is read AS AT the period**, not as at today.
 *     Recomputing July in September must use July's KPI amounts and July's
 *     hierarchy, or reopening an old month silently repays it at today's rules.
 *  2. **Carry-forward.** The run's own month is not the whole input: an order
 *     the deposit gate held in June belongs in July's run if the customer has
 *     since topped up. Those orders arrive with their ORIGINAL period_month, so
 *     the engine can label them "carried from 2026-06".
 *  3. **Already-released orders are still passed in**, flagged. Dropping them
 *     at the query would work for commission, but their revenue would vanish
 *     from group sales — and group sales drive promotions.
 */

import { splitOrdersByShares } from './shares'
import { upsalesToOrders, type UpsaleRow } from './upsales'
import {
  EMPTY_KPI_INDEX,
  indexItemGroups,
  indexKpiItems,
  orderProductRevenue,
  ownSchemesOf,
  round2,
} from './engine'
import { EMPTY_FABRIC_SERIES, indexFabricSeries, isKpiOptionPool, lineKpiFactsOf, toUnitTiers, type FabricSeriesRow } from './kpi'
import { isOldBillDate } from './row-origin'
import { gwpFreeParts, type GwpRule } from '@/lib/catalogue/gwp'
import type {
  DirectorTerms,
  EngineInput,
  EngineResult,
  ItemGroupRule,
  KpiItem,
  KpiThreshold,
  MarginBand,
  MarginBandKind,
  PriorMonth,
  Rank,
  RateMode,
  SalesOrder,
  Statement,
  StatementLine,
} from './types'

// ─── Row shapes as they come back from Supabase ─────────────────────────────
// Deliberately hand-written rather than pulled from database.types.ts: comm_*
// and sales_* postdate the generated types, and the untyped-client convention
// is already established across this module.

/** DECIMAL columns arrive as string over PostgREST when they are large. */
type Num = number | string | null | undefined

export interface SchemeRow {
  id: string
  sub_department_id: string
  override_includes_kpi: boolean
  deposit_threshold_pct: Num
  default_rate_mode: RateMode
  enable_product_revenue: boolean
  enable_kpi: boolean
  enable_override: boolean
  enable_margin_penalty: boolean
  enable_margin_incentive: boolean
  enable_group_incentive?: boolean
  group_sales_depth?: number | null
  override_depth?: number | null
  /** Revenue Team cost = cost ÷ this (Fair 0.7, 2026-09-12). Absent = 1. */
  revenue_cost_divisor?: Num
}

export interface RankRow {
  rank_key: string
  title_id: string
  /** Embedded `titles (name)` — the label warnings use. */
  titles: { name: string } | { name: string }[] | null
  label: string
  product_rate: Num
  group_incentive_amount?: Num
  group_subsidy_cap?: Num
  can_recruit: boolean
  group_sales_threshold: Num
  personal_sales_threshold: Num
  consecutive_months: number | null
  sort_order: number
  /**
   * Embedded `comm_rank_defs (brand_rates)` — what the rank pays on a bill of a
   * brand with its own scheme (2026-11-11), keyed by `comm_brands.id`. Absent in
   * older fixtures.
   */
  comm_rank_defs?: { brand_rates: unknown } | { brand_rates: unknown }[] | null
}

/** A brand of the scheme, as far as a run needs it (`comm_brands`, 2026-11-11). */
export interface BrandRow {
  id: string
  code: string
  /** It follows its own commission scheme: its own rate per rank, no margin, its own KPI items. */
  own_scheme?: boolean | null
  /** Switched off, it is no brand of its own scheme (as the database reads it). Absent in older fixtures = on. */
  is_active?: boolean | null
}

/**
 * What a line's special order charges for one special (`sales_order_special_money`, 2026-11-12): the special's
 * name as the database keys it (`catalogue_value_key`) and RM, above nothing.
 */
export interface SpecialMoneyRow {
  line_id: string
  special_key: string
  amount: Num
}

/**
 * One earlier month's run, as far as a streak gate needs it: whose own
 * revenue was what. Only months that were actually run are passed — a month
 * with no run is unknown, not zero, and a streak cannot cross it.
 */
export interface PriorMonthRow {
  period_month: string
  comm_statements: Array<{ staff_id: string; product_revenue: Num }> | null
}

export interface ItemGroupRow {
  item_group: string
  commissionable: boolean
}

/**
 * A KPI item: a SKU (`product_code`), a Maintenance special or a fabric series
 * (`option_pool` + `option_value`) — Rules › KPI items (the Product List's
 * Add-on / KPI Items until 2026-10-08).
 * Rows written before 2026-09-27 carry no `source` and are SKUs.
 */
export interface KpiItemRow {
  source?: 'sku' | 'option' | null
  product_code: string | null
  product_name?: string | null
  option_pool?: string | null
  option_value?: string | null
  kpi_amount: Num
  /** The brand whose own item this is (`comm_brands.id`, 2026-11-12); null / absent = the sub-department's own. */
  brand_id?: string | null
  /** A brand's own item alone: `[{min_qty, amount}]` — what a unit pays once the month's units reach a tier. */
  unit_tiers?: unknown
  /** A brand's own item alone (2026-11-13): RM a unit taken off the bill; null / absent = what the bill charged. */
  cost_amount?: Num | null
  /** A brand's own item alone (2026-11-14): RM a unit taken off the bill of a sofa with a corner; null / absent = its cost. */
  corner_cost_amount?: Num | null
}

/** A SKU's own cost ratio (`comm_cost_ratios`, Product List › Costing Setting). */
export interface CostRatioRow {
  product_code: string
  ratio: Num
}

/** A rider SKU's cost ratio for one brand (`comm_cost_ratio_brands`, Costing Setting, 2026-11-07). */
export interface CostRatioBrandRow {
  product_code: string
  brand_code: string
  ratio: Num
}

/** A brand's cost ratio in the sub-department (`comm_brand_cost_ratios`, Costing Setting, 2026-11-14). */
export interface BrandCostRatioRow {
  brand_code: string
  ratio: Num
}

/** The rows as the engine reads them: a positive ratio and a brand, else left out (that brand takes the default). */
export function toBrandDivisors(rows: readonly BrandCostRatioRow[] | undefined): { brand: string; ratio: number }[] {
  return (rows ?? []).flatMap(r => {
    const ratio = numOrNull(r.ratio)
    return ratio !== null && ratio > 0 && (r.brand_code ?? '').trim() ? [{ brand: r.brand_code, ratio }] : []
  })
}

/** The rows as the engine reads them: a positive ratio, a code and a brand, else left out (that brand takes the next ratio). */
export function toCostRatiosByBrand(rows: readonly CostRatioBrandRow[] | undefined): { productCode: string; brand: string; ratio: number }[] {
  return (rows ?? []).flatMap(r => {
    const ratio = numOrNull(r.ratio)
    return ratio !== null && ratio > 0 && (r.product_code ?? '').trim() && (r.brand_code ?? '').trim()
      ? [{ productCode: r.product_code, brand: r.brand_code, ratio }]
      : []
  })
}

/**
 * A gift with purchase (Product List › GWP, 2026-11-08), as the loader reads it: the codes of its buy and
 * gift SKUs (`catalogue_gwp_items.product_code`), each gift with its units per unit bought (`qty`, the user's
 * "加 1、加 2、加 3"). No dates (the user).
 */
export interface GwpRow {
  id: string
  catalogue_gwp_items: { role: string; product_code: string; qty?: Num }[] | null
}

/** The rows as the costing reads them; a GWP with no buy SKU or no gift with a quantity is left out. */
export function toGwpRules(rows: readonly GwpRow[] | undefined): GwpRule[] {
  return (rows ?? []).flatMap(r => {
    const items = r.catalogue_gwp_items ?? []
    const buy = items.filter(i => i.role === 'buy').map(i => i.product_code)
    const gifts = items.flatMap(i => {
      const perUnit = i.role === 'gift' ? numOrNull(i.qty ?? null) : null
      return perUnit !== null && perUnit > 0 ? [{ code: i.product_code, perUnit }] : []
    })
    return buy.length && gifts.length ? [{ id: r.id, buy, gifts }] : []
  })
}

/** A bill's lines with each one's part given with a purchase, worked out on the whole bill. */
export function withGwp(order: SalesOrder, rules: readonly GwpRule[]): SalesOrder {
  if (!rules.length) return order
  const parts = gwpFreeParts(
    order.lines.map(l => ({ id: l.id, productCode: l.productCode, qty: l.qty, costAmount: l.costAmount ?? null })),
    rules,
  )
  if (!parts.size) return order
  return { ...order, lines: order.lines.map(l => (parts.has(l.id) ? { ...l, gwpFree: parts.get(l.id)! } : l)) }
}

export interface KpiThresholdRow {
  min_qty: number
  bonus_pct: Num
}

export interface MarginBandRow {
  band_key: string
  label: string
  kind: MarginBandKind
  margin_pct: Num
  commission_multiplier: Num
  monthly_incentive: Num
  comm_brands: { code: string } | { code: string }[] | null
}

export interface HierarchyRow {
  staff_id: string
  upline_staff_id: string | null
  rate_mode: RateMode | null
  comm_ranks: { rank_key: string } | { rank_key: string }[] | null
  /**
   * The title held IN THIS SUB-DEPARTMENT — the ratchet the run climbs
   * (`comm_hierarchy.title_id`, 2026-09-10). The company title on
   * `hr_staff_costs` may differ on a sub-department that is not the home one.
   */
  title_id: string | null
}

export interface SalesLineRow {
  id: string
  item_group: string
  product_code: string
  product_name: string | null
  qty: Num
  line_amount: Num
  brand_code: string | null
  cost_amount: Num
  /** What its bed frame's divan, leg, gap and total height were charged (2026-10-05). Absent in older fixtures. */
  option_charge_amount?: Num
  /** The ERP's option summary and structured variants — where specials are read. */
  description2?: string | null
  variants?: unknown
}

export interface SalesOrderRow {
  id: string
  order_no: string
  staff_id: string | null
  order_date: string
  event_date: string
  period_month: string
  order_total: Num
  paid_amount: Num
  manual_margin_pct: Num
  /** The brand the bill was written under (the ERP's Branding). Absent in older fixtures. */
  brand_code?: string | null
  /** `erp_sync` for the ERP's bills (2026-11-07: only those can be an old bill topped up). Absent in older fixtures. */
  source?: string | null
  /** Half comm (2026-11-10, `sales_order_half_comm`): set by the loader, never a column. */
  half_comm?: boolean
  /** No commission (2026-11-14, `sales_order_no_comm`): set by the loader, never a column. */
  no_comm?: boolean
  sales_order_lines: SalesLineRow[] | null
}

export interface RunSourceRows {
  periodMonth: string
  /**
   * The feed window's floor (`erp_feed_settings.min_order_date`, 2026-11-07):
   * an ERP bill dated before it, in a month from it on, is an old bill topped
   * up and pays commission only. Absent = no old bills.
   */
  feedFloor?: string | null
  scheme: SchemeRow
  ranks: RankRow[]
  itemGroups: ItemGroupRow[]
  kpiItems: KpiItemRow[]
  kpiThresholds: KpiThresholdRow[]
  marginBands: MarginBandRow[]
  hierarchy: HierarchyRow[]
  orders: SalesOrderRow[]
  /** order_no of every order an applied run has already paid for. */
  releasedOrderNos: string[]
  /** The months before this one that have a run, any order. */
  priorMonths: PriorMonthRow[]
  /** `sales_order_shares` for these orders. Absent = nobody shares anything. */
  shares?: OrderShareRow[]
  /** `comm_upsales` recorded under this month. Absent = none. */
  upsales?: UpsaleRow[]
  /**
   * The shares of the bills those upsales and drops changed, keyed by the
   * UPSALE's id (2026-10-13): a change to a shared bill is split as the bill
   * is. Absent = nobody shares any of them.
   */
  upsaleShares?: OrderShareRow[]
  /** `comm_cost_ratios` of this scheme. Absent = every SKU at the default. */
  costRatios?: CostRatioRow[]
  /** `comm_cost_ratio_brands` of this scheme (2026-11-07). Absent = no SKU has a ratio by brand. */
  costRatiosByBrand?: CostRatioBrandRow[]
  /** `comm_brand_cost_ratios` of this scheme (2026-11-14). Absent = no brand has a ratio of its own. */
  brandCostRatios?: BrandCostRatioRow[]
  /** Product List › GWP (2026-11-08): every gift with purchase. Absent = none. */
  gwp?: GwpRow[]
  /**
   * The ERP's fabric list (`erp_fabrics`), read only while a KPI item is a
   * fabric series (2026-10-29). Absent = no line's fabric has a series.
   */
  fabrics?: FabricSeriesRow[]
  /**
   * Who among the sellers holds a title that heads the department
   * (`titles.is_department_head`). Absent = nobody.
   */
  departmentHeadIds?: string[]
  /**
   * What each department head is paid here (2026-09-27), already resolved by
   * the loader: their title's rung and the Directors tab. Absent = nothing.
   */
  directors?: DirectorTerms[]
  /** The month's Commissionable value (Comm Cal's card), when an incentive needs it. */
  monthCommissionableValue?: number
  /**
   * The scheme's brands (`comm_brands`, 2026-11-11): which follow their own
   * scheme, and the code a rank's rate for one is read by. Absent = none does.
   */
  brands?: BrandRow[]
  /**
   * What the special orders of the bills of a brand with KPI items of its own
   * charge (2026-11-12): a brand's own item is found where its bill charges for
   * it, and takes that off the bill's sales. Absent = no bill charges for one.
   */
  specialMoney?: SpecialMoneyRow[]
}

/** A `sales_order_shares` row. */
export interface OrderShareRow {
  order_id: string
  staff_id: string
  share_pct: Num
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function num(v: Num, fallback = 0): number {
  if (v === null || v === undefined || v === '') return fallback
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function numOrNull(v: Num): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * PostgREST returns an embedded one-to-one either as an object or, when it
 * cannot prove the relationship is singular, as a one-element array. Both
 * shapes are legitimate; guessing wrong loses the rank or the brand silently.
 */
function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

// ─── rows → EngineInput ─────────────────────────────────────────────────────

/**
 * KPI item rows as the engine reads them. A row that names neither a code nor
 * a known pool's option cannot be found on any bill and is dropped.
 */
export function toKpiItems(rows: readonly KpiItemRow[], ownBrands: ReadonlyMap<string, string> = new Map()): KpiItem[] {
  return rows.flatMap((k): KpiItem[] => {
    const kpiAmount = num(k.kpi_amount)
    const label = k.product_name ?? null
    // A brand's own item (2026-11-12): its brand's code, its tiers, its cost and its corner cost (2026-11-14).
    // One whose brand is not on its own scheme — switched off, or no longer on
    // it — is found on no bill: never read as the sub-department's own.
    let brand: Pick<KpiItem, 'brandCode' | 'unitTiers' | 'cost' | 'cornerCost'> = {}
    if (k.brand_id) {
      const brandCode = ownBrands.get(k.brand_id) ?? ownBrands.get(k.brand_id.toLowerCase())
      if (!brandCode) return []
      const unitTiers = toUnitTiers(k.unit_tiers)
      const cost = k.cost_amount === null || k.cost_amount === undefined ? 0 : num(k.cost_amount)
      const cornerCost = k.corner_cost_amount === null || k.corner_cost_amount === undefined ? 0 : num(k.corner_cost_amount)
      brand = {
        brandCode, ...(unitTiers.length > 0 ? { unitTiers } : {}), ...(cost > 0 ? { cost } : {}),
        ...(cornerCost > 0 ? { cornerCost } : {}),
      }
    }
    if ((k.source ?? 'sku') === 'sku') {
      return k.product_code ? [{ source: 'sku', productCode: k.product_code, label, kpiAmount, ...brand }] : []
    }
    return k.option_pool && isKpiOptionPool(k.option_pool) && k.option_value
      ? [{ source: 'option', optionPool: k.option_pool, optionValue: k.option_value, label, kpiAmount, ...brand }]
      : []
  })
}

/**
 * The brands that follow their own scheme, by id → the code a bill carries
 * (2026-11-11 — 2990s). A brand without a code cannot be found on any bill;
 * one switched off is no brand of its own scheme (the database's readers ask
 * `is_active` too — `comm_kpi_hits`, `member_order_facts`).
 */
export function ownSchemeBrandsOf(brands: readonly BrandRow[] | undefined): Map<string, string> {
  return new Map((brands ?? []).flatMap(b => {
    const code = (b.code ?? '').trim().toUpperCase()
    return b.own_scheme && b.is_active !== false && code ? [[b.id, code] as const] : []
  }))
}

/**
 * What each line's special order charges, as a line carries it
 * (`SalesLine.specialMoney`): line id → the special's name → RM. A row that
 * charges nothing, or names no special, is left out.
 */
export function specialMoneyByLine(rows: readonly SpecialMoneyRow[] | undefined): Map<string, Record<string, number>> {
  const byLine = new Map<string, Record<string, number>>()
  for (const row of rows ?? []) {
    const amount = num(row.amount)
    const key = (row.special_key ?? '').trim()
    if (!row.line_id || !key || !(amount > 0)) continue
    const line = byLine.get(row.line_id) ?? {}
    // The dearest copy, as the database's reader keeps one (MAX).
    line[key] = Math.max(line[key] ?? 0, amount)
    byLine.set(row.line_id, line)
  }
  return byLine
}

/**
 * A rank's rates for the brands with their own scheme, as the engine reads
 * them: `comm_rank_defs.brand_rates` is keyed by the brand's id (a brand may be
 * renamed); the engine finds a bill's brand by its code. A rate that is not a
 * fraction between 0 and 1, or one for a brand that is not on its own scheme,
 * is left out — the rank then pays that brand as the rung below (`brandRateOf`).
 */
export function toBrandRates(raw: unknown, ownBrands: ReadonlyMap<string, string>): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || ownBrands.size === 0) return undefined
  const rates: Record<string, number> = {}
  for (const [brandId, value] of Object.entries(raw as Record<string, unknown>)) {
    // An id is compared in lower case, as the database writes one.
    const code = ownBrands.get(brandId) ?? ownBrands.get(brandId.toLowerCase())
    const rate = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
    if (code && Number.isFinite(rate) && rate >= 0 && rate <= 1) rates[code] = rate
  }
  return Object.keys(rates).length > 0 ? rates : undefined
}

export function toEngineInput(rows: RunSourceRows): EngineInput {
  const released = new Set(rows.releasedOrderNos)
  // (2026-11-07) An old bill topped up: commission only.
  // A bed frame's or a sofa's specials and fabric series — how an option KPI item is found.
  const fabrics = rows.fabrics?.length ? indexFabricSeries(rows.fabrics) : EMPTY_FABRIC_SERIES
  const lineFacts = (l: SalesLineRow) => lineKpiFactsOf(l.item_group, l.description2, l.variants, fabrics)
  // (2026-11-11) The brands that follow their own scheme — 2990s.
  const ownBrands = ownSchemeBrandsOf(rows.brands)

  const ranks: Rank[] = rows.ranks.map(r => {
    const brandRates = toBrandRates(one(r.comm_rank_defs)?.brand_rates, ownBrands)
    return {
      rankKey: r.rank_key,
      titleId: r.title_id,
      titleLabel: one(r.titles)?.name ?? r.label,
      label: r.label,
      productRate: num(r.product_rate),
      groupIncentiveAmount: num(r.group_incentive_amount),
      groupSubsidyCap: num(r.group_subsidy_cap),
      canRecruit: r.can_recruit,
      groupSalesThreshold: numOrNull(r.group_sales_threshold),
      personalSalesThreshold: numOrNull(r.personal_sales_threshold),
      consecutiveMonths: r.consecutive_months ?? null,
      sortOrder: r.sort_order,
      ...(brandRates ? { brandRates } : {}),
    }
  })

  // Most recent first, so a streak walks back month by month.
  const priorMonths: PriorMonth[] = [...rows.priorMonths]
    .sort((a, b) => (a.period_month < b.period_month ? 1 : -1))
    .map(p => ({
      periodMonth: p.period_month,
      personalRevenue: Object.fromEntries(
        (p.comm_statements ?? []).map(s => [s.staff_id, num(s.product_revenue)]),
      ),
    }))

  const itemGroups: ItemGroupRule[] = rows.itemGroups.map(g => ({
    group: g.item_group,
    commissionable: g.commissionable,
  }))

  const kpiItems = toKpiItems(rows.kpiItems, ownBrands)
  // (2026-11-12) What the special orders of a brand's bills charge — how its own KPI items are found.
  const specialMoney = specialMoneyByLine(rows.specialMoney)

  const kpiThresholds: KpiThreshold[] = rows.kpiThresholds.map(t => ({
    minQty: t.min_qty,
    bonusPct: num(t.bonus_pct),
  }))

  // A band with no brand is unusable — the whole ladder is keyed by brand —
  // so it is dropped rather than applied to everybody.
  const marginBands: MarginBand[] = rows.marginBands.flatMap(b => {
    const brand = one(b.comm_brands)
    if (!brand) return []
    return [
      {
        brandCode: brand.code,
        bandKey: b.band_key,
        label: b.label,
        kind: b.kind,
        marginPct: num(b.margin_pct),
        commissionMultiplier: num(b.commission_multiplier, 1),
        monthlyIncentive: num(b.monthly_incentive),
      },
    ]
  })

  const hierarchy = rows.hierarchy.flatMap(h => {
    const rank = one(h.comm_ranks)
    if (!rank) return []
    return [
      {
        staffId: h.staff_id,
        uplineStaffId: h.upline_staff_id,
        baseRankKey: rank.rank_key,
        rateMode: h.rate_mode ?? rows.scheme.default_rate_mode,
        titleId: h.title_id ?? null,
      },
    ]
  })

  const gwpRules = toGwpRules(rows.gwp)

  // An unmatched agent has no staff_id, so the order pays nobody. It is dropped
  // here rather than passed through as a phantom salesperson — the period page
  // and the import wizard are where that gets resolved, loudly.
  const wholeOrders: SalesOrder[] = rows.orders
    .filter(o => o.staff_id !== null)
    .map(o => ({
      id: o.id,
      orderNo: o.order_no,
      staffId: o.staff_id as string,
      orderDate: o.order_date,
      periodMonth: o.period_month,
      eventDate: o.event_date,
      orderTotal: num(o.order_total),
      paidAmount: num(o.paid_amount),
      alreadyReleased: released.has(o.order_no),
      // An old bill topped up pays its holder commission only (2026-11-07).
      ...((o.source ?? 'erp_sync') === 'erp_sync' && isOldBillDate(o.order_date, o.period_month, rows.feedFloor ?? null)
        ? { commissionOnly: true } : {}),
      // Half comm (2026-11-10): the bill's own commission and override base halved.
      ...(o.half_comm ? { halfComm: true } : {}),
      // No commission (2026-11-14): nobody is paid on the bill; it counts in sales, margin and the KPI count.
      ...(o.no_comm ? { noCommission: true } : {}),
      manualMarginPct: numOrNull(o.manual_margin_pct),
      brandCode: o.brand_code?.trim() || null,
      lines: (o.sales_order_lines ?? []).map(l => ({
        id: l.id,
        itemGroup: l.item_group,
        productCode: l.product_code,
        productName: l.product_name ?? undefined,
        qty: num(l.qty),
        lineAmount: num(l.line_amount),
        brandCode: l.brand_code ?? undefined,
        costAmount: numOrNull(l.cost_amount) ?? undefined,
        // Only when there is one: a line without a charge reads exactly as it always has.
        ...(numOrNull(l.option_charge_amount) ? { optionCharge: numOrNull(l.option_charge_amount)! } : {}),
        ...lineFacts(l),
        ...(specialMoney.has(l.id) ? { specialMoney: specialMoney.get(l.id)! } : {}),
      })),
    }))
    // A gift with purchase (Product List › GWP, 2026-11-08), worked out on the whole bill before it is shared.
    .map(o => withGwp(o, gwpRules))

  // A shared bill becomes one part per holder, each paid at its holder's rate
  // and climbing its holder's line (`lib/commission/shares.ts`). An upsale HR
  // recorded joins as a one-line order of its own (`lib/commission/upsales.ts`)
  // — split the same way when the bill it changed is shared (2026-10-13, the
  // user: "want drop sales by share as well. Follow the share ratio").
  const toShares = (list: OrderShareRow[] | undefined) =>
    (list ?? []).map(r => ({ orderId: r.order_id, staffId: r.staff_id, pct: num(r.share_pct) }))
  const orders = [
    ...splitOrdersByShares(wholeOrders, toShares(rows.shares)),
    ...splitOrdersByShares(upsalesToOrders(rows.upsales ?? [], rows.periodMonth), toShares(rows.upsaleShares)),
  ]

  return {
    periodMonth: rows.periodMonth,
    scheme: {
      overrideIncludesKpi: rows.scheme.override_includes_kpi,
      enableProductRevenue: rows.scheme.enable_product_revenue,
      enableKpi: rows.scheme.enable_kpi,
      enableOverride: rows.scheme.enable_override,
      enableMarginPenalty: rows.scheme.enable_margin_penalty,
      enableMarginIncentive: rows.scheme.enable_margin_incentive,
      enableGroupIncentive: rows.scheme.enable_group_incentive ?? false,
      groupSalesDepth: rows.scheme.group_sales_depth ?? null,
      overrideDepth: rows.scheme.override_depth ?? null,
      itemGroups,
      depositThresholdPct: numOrNull(rows.scheme.deposit_threshold_pct),
      defaultRateMode: rows.scheme.default_rate_mode,
      costDivisor: numOrNull(rows.scheme.revenue_cost_divisor) ?? 1,
      costRatios: (rows.costRatios ?? []).flatMap(r => {
        const ratio = numOrNull(r.ratio)
        return ratio !== null && ratio > 0 ? [{ productCode: r.product_code, ratio }] : []
      }),
      ...(rows.costRatiosByBrand?.length ? { costRatiosByBrand: toCostRatiosByBrand(rows.costRatiosByBrand) } : {}),
      ...(rows.brandCostRatios?.length ? { brandDivisors: toBrandDivisors(rows.brandCostRatios) } : {}),
    },
    ranks,
    orders,
    kpiItems,
    kpiThresholds,
    marginBands,
    hierarchy,
    priorMonths,
    departmentHeadIds: [...new Set(rows.departmentHeadIds ?? [])],
    ...(rows.directors?.length ? { directors: rows.directors } : {}),
    ...(rows.monthCommissionableValue !== undefined ? { monthCommissionableValue: rows.monthCommissionableValue } : {}),
    ...(ownBrands.size > 0 ? { ownSchemeBrands: [...new Set(ownBrands.values())] } : {}),
  }
}

// ─── EngineResult → save_commission_run payload ─────────────────────────────

export interface ReleasedOrderDto {
  order_id: string
  order_no: string
  staff_id: string
  order_period_month: string
  product_revenue: number
}

export interface StatementLineDto {
  component: StatementLine['component']
  source_order_id: string | null
  source_line_id: string | null
  source_staff_id: string | null
  basis_amount: number
  rate: number | null
  qty: number | null
  amount: number
  note: string
}

export interface StatementDto {
  staff_id: string
  rank_title_id: string | null
  promotes_to_title_id: string | null
  base_rank_key: string | null
  rank_key: string | null
  rate_mode: RateMode
  qualifies_for_rank_key: string | null
  product_rate: number
  upline_staff_id: string | null
  product_revenue: number
  penalty_weighted_revenue: number
  group_revenue: number
  deferred_revenue: number
  excluded_revenue: number
  product_commission: number
  kpi_qty: number
  kpi_base: number
  kpi_threshold_pct: number
  kpi_commission: number
  override_commission: number
  margin_revenue: number
  margin_cost: number
  margin_pct: number | null
  margin_band_key: string | null
  margin_incentive: number
  group_incentive: number
  group_subsidy_cap: number
  group_breakdown: NonNullable<Statement['groupBreakdown']>
  full_spec: boolean
  margin_penalty_withheld: number
  /** A director's fixed amount and threshold incentive (2026-09-27); 0 for anybody else. */
  director_fixed: number
  director_incentive: number
  total_commission: number
  lines: StatementLineDto[]
  brand_margins: Array<{
    brand_code: string
    revenue: number
    cost: number
    margin_pct: number | null
    top_band_key: string | null
  }>
}

export interface RunPayload {
  p_period_month: string
  p_total_commission: number
  p_warnings: string[]
  p_statements: StatementDto[]
  p_released_orders: ReleasedOrderDto[]
  p_deferred_orders: EngineResult['deferred']
  p_penalised_orders: EngineResult['penalised']
}

/**
 * The orders this run is paying for.
 *
 * "Released" is everything that was NOT held by the deposit gate and was not
 * already paid by an earlier run — including an order that produced no
 * commission at all (all transport, say). That is deliberate: releasing it
 * closes it, so next month's run does not reconsider it forever.
 */
export function releasedOrders(input: EngineInput, result: EngineResult): ReleasedOrderDto[] {
  const held = new Set(result.deferred.map(d => d.orderId))
  // The KPI items a bill may carry, as the engine reads them: none of the
  // sub-department's on a bill of a brand with its own scheme (2026-11-11).
  const kpiIndexOf = ownSchemesOf(input, input.scheme.enableKpi ? indexKpiItems(input.kpiItems) : EMPTY_KPI_INDEX).kpiIndexFor
  const groupIndex = indexItemGroups(input.scheme.itemGroups)

  // One release per BILL: a shared bill reaches the engine as one part per
  // holder, but it is paid — and must never be paid again — as one document
  // (`uq_comm_release_per_sub_order`). The owner's part comes first, so the
  // release names the owner; the revenue is the whole bill's.
  const byOrder = new Map<string, ReleasedOrderDto>()
  for (const o of input.orders) {
    // An upsale is not an ERP bill: it is read by its own month and never
    // carried, so there is nothing to close — and it has no sales_orders row.
    if (o.upsale) continue
    if (o.alreadyReleased || held.has(o.id)) continue
    const revenue = orderProductRevenue(o, kpiIndexOf(o), groupIndex)
    const seen = byOrder.get(o.id)
    if (seen) {
      seen.product_revenue = round2(seen.product_revenue + revenue)
      continue
    }
    byOrder.set(o.id, {
      order_id: o.id,
      order_no: o.orderNo,
      staff_id: o.staffId,
      order_period_month: o.periodMonth,
      product_revenue: round2(revenue),
    })
  }
  return [...byOrder.values()]
}

/**
 * `upsaleIds`: an upsale's line points at `comm_upsales`, not at a sales order
 * — `comm_statement_lines.source_order_id` is a foreign key to sales_orders, so
 * it is left empty and the note names the upsale instead.
 */
function toStatementDto(s: Statement, upsaleIds: ReadonlySet<string>): StatementDto {
  return {
    staff_id: s.staffId,
    rank_title_id: s.rankTitleId,
    promotes_to_title_id: s.promotesToTitleId,
    base_rank_key: s.baseRankKey,
    rank_key: s.effectiveRankKey,
    rate_mode: s.rateMode,
    qualifies_for_rank_key: s.qualifiesForRankKey,
    product_rate: s.productRate,
    upline_staff_id: s.uplineStaffId,
    product_revenue: s.productRevenue,
    penalty_weighted_revenue: s.penaltyWeightedRevenue,
    group_revenue: s.groupRevenue,
    deferred_revenue: s.deferredRevenue,
    excluded_revenue: s.excludedRevenue,
    product_commission: s.productCommission,
    kpi_qty: s.kpiQty,
    kpi_base: s.kpiBase,
    kpi_threshold_pct: s.kpiThresholdPct,
    kpi_commission: s.kpiCommission,
    override_commission: s.overrideCommission,
    margin_revenue: s.marginRevenue,
    margin_cost: s.marginCost,
    margin_pct: s.marginPct,
    margin_band_key: s.marginBandKey,
    margin_incentive: s.marginIncentive,
    group_incentive: s.groupIncentive ?? 0,
    group_subsidy_cap: s.groupSubsidyCap ?? 0,
    group_breakdown: s.groupBreakdown ?? [],
    director_fixed: s.directorFixed ?? 0,
    director_incentive: s.directorIncentive ?? 0,
    full_spec: s.fullSpec ?? false,
    margin_penalty_withheld: s.marginPenaltyWithheld,
    total_commission: s.totalCommission,
    lines: s.lines.map(l => ({
      component: l.component,
      source_order_id: l.sourceOrderId && !upsaleIds.has(l.sourceOrderId) ? l.sourceOrderId : null,
      source_line_id: l.sourceLineId && !upsaleIds.has(l.sourceLineId) ? l.sourceLineId : null,
      source_staff_id: l.sourceStaffId ?? null,
      basis_amount: l.basisAmount,
      rate: l.rate,
      qty: l.qty,
      amount: l.amount,
      note: l.note,
    })),
    // A brand slice with no brand code is the "sales that carry no brand at
    // all" case. It has nowhere to go in comm_statement_brand_margins (the
    // column is NOT NULL) and the statement already records it as a warning.
    brand_margins: s.marginByBrand
      .filter(b => b.brandCode !== null)
      .map(b => ({
        brand_code: b.brandCode as string,
        revenue: b.revenue,
        cost: b.cost,
        margin_pct: b.marginPct,
        top_band_key: s.marginBandKey,
      })),
  }
}

export function toRunPayload(input: EngineInput, result: EngineResult): RunPayload {
  const upsaleIds = new Set(input.orders.filter(o => o.upsale).map(o => o.id))
  return {
    p_period_month: result.periodMonth,
    p_total_commission: result.totalCommission,
    p_warnings: result.warnings,
    // A statement with nothing on it is noise on the run dashboard: someone in
    // the hierarchy who simply did not sell this month and earned no override.
    p_statements: result.statements
      .filter(s => s.totalCommission !== 0 || s.productRevenue !== 0 || s.deferredRevenue !== 0)
      .map(s => toStatementDto(s, upsaleIds)),
    p_released_orders: releasedOrders(input, result),
    p_deferred_orders: result.deferred,
    p_penalised_orders: result.penalised,
  }
}
