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
  indexItemGroups,
  indexKpiItems,
  orderProductRevenue,
  round2,
} from './engine'
import type {
  EngineInput,
  EngineResult,
  ItemGroupRule,
  KpiItem,
  KpiThreshold,
  MarginBand,
  MarginBandKind,
  OpenBillRank,
  OpenBillRule,
  OpenBillTag,
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
  open_bill_basis: 'uplift_on_commission' | 'pct_of_revenue'
  override_includes_kpi: boolean
  deposit_threshold_pct: Num
  default_rate_mode: RateMode
  enable_product_revenue: boolean
  enable_kpi: boolean
  enable_open_bill: boolean
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

export interface KpiItemRow {
  product_code: string
  kpi_amount: Num
}

export interface KpiThresholdRow {
  min_qty: number
  bonus_pct: Num
}

export interface OpenBillRuleRow {
  bill_rank: number
  pct: Num
}

export interface OpenBillTagRow {
  order_id: string
  bill_rank: number
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
  sales_order_lines: SalesLineRow[] | null
}

export interface RunSourceRows {
  periodMonth: string
  scheme: SchemeRow
  ranks: RankRow[]
  itemGroups: ItemGroupRow[]
  kpiItems: KpiItemRow[]
  kpiThresholds: KpiThresholdRow[]
  openBillRules: OpenBillRuleRow[]
  openBillTags: OpenBillTagRow[]
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

function isBillRank(n: number): n is OpenBillRank {
  return n === 1 || n === 2 || n === 3
}

// ─── rows → EngineInput ─────────────────────────────────────────────────────

export function toEngineInput(rows: RunSourceRows): EngineInput {
  const released = new Set(rows.releasedOrderNos)

  const ranks: Rank[] = rows.ranks.map(r => ({
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
  }))

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

  const kpiItems: KpiItem[] = rows.kpiItems.map(k => ({
    productCode: k.product_code,
    kpiAmount: num(k.kpi_amount),
  }))

  const kpiThresholds: KpiThreshold[] = rows.kpiThresholds.map(t => ({
    minQty: t.min_qty,
    bonusPct: num(t.bonus_pct),
  }))

  const openBillRules: OpenBillRule[] = rows.openBillRules
    .filter(r => isBillRank(r.bill_rank))
    .map(r => ({ rank: r.bill_rank as OpenBillRank, pct: num(r.pct) }))

  const openBillTags: OpenBillTag[] = rows.openBillTags
    .filter(t => isBillRank(t.bill_rank))
    .map(t => ({ orderId: t.order_id, rank: t.bill_rank as OpenBillRank }))

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
      manualMarginPct: numOrNull(o.manual_margin_pct),
      lines: (o.sales_order_lines ?? []).map(l => ({
        id: l.id,
        itemGroup: l.item_group,
        productCode: l.product_code,
        productName: l.product_name ?? undefined,
        qty: num(l.qty),
        lineAmount: num(l.line_amount),
        brandCode: l.brand_code ?? undefined,
        costAmount: numOrNull(l.cost_amount) ?? undefined,
      })),
    }))

  // A shared bill becomes one part per holder, each paid at its holder's rate
  // and climbing its holder's line (`lib/commission/shares.ts`). An upsale HR
  // recorded joins as a one-line order of its own (`lib/commission/upsales.ts`).
  const orders = [
    ...splitOrdersByShares(
      wholeOrders,
      (rows.shares ?? []).map(r => ({ orderId: r.order_id, staffId: r.staff_id, pct: num(r.share_pct) })),
    ),
    ...upsalesToOrders(rows.upsales ?? [], rows.periodMonth),
  ]

  return {
    periodMonth: rows.periodMonth,
    scheme: {
      openBillBasis: rows.scheme.open_bill_basis,
      overrideIncludesKpi: rows.scheme.override_includes_kpi,
      enableProductRevenue: rows.scheme.enable_product_revenue,
      enableKpi: rows.scheme.enable_kpi,
      enableOpenBill: rows.scheme.enable_open_bill,
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
    },
    ranks,
    orders,
    kpiItems,
    kpiThresholds,
    openBillRules,
    openBillTags,
    marginBands,
    hierarchy,
    priorMonths,
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
  open_bill_bonus: number
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
  const kpiIndex = input.scheme.enableKpi
    ? indexKpiItems(input.kpiItems)
    : new Map<string, number>()
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
    const revenue = orderProductRevenue(o, kpiIndex, groupIndex)
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
    open_bill_bonus: s.openBillBonus,
    override_commission: s.overrideCommission,
    margin_revenue: s.marginRevenue,
    margin_cost: s.marginCost,
    margin_pct: s.marginPct,
    margin_band_key: s.marginBandKey,
    margin_incentive: s.marginIncentive,
    group_incentive: s.groupIncentive ?? 0,
    group_subsidy_cap: s.groupSubsidyCap ?? 0,
    group_breakdown: s.groupBreakdown ?? [],
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
