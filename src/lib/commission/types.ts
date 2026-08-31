/**
 * Revenue Department commission engine — input / output shapes.
 *
 * Deliberately free of Supabase types: the engine is pure so it can be
 * unit-tested against hand-worked examples with no database. The Server Action
 * is responsible for loading these shapes out of Postgres and posting the
 * result back through `apply_commission_run`.
 *
 * Scope note (user brief 2026-08-31): the Revenue Department is divided into
 * SUB-DEPARTMENTS, and each one calculates differently. The four components
 * modelled here are the **Fair** sub-department's ruleset (the roadshow /
 * event team). A scheme therefore belongs to a sub-department and can switch
 * each component off, so a future sub-department can reuse what applies and
 * drop what doesn't.
 *
 * See docs/module-spec-revenue-commission.md §3 for the money rules.
 */

// ─── Imported facts ─────────────────────────────────────────────────────────

export interface SalesLine {
  id: string
  /** ERP `Item Group`, e.g. MATTRESS / SOFA / ACC / TRANS. Drives whether the
   *  line's revenue is commissionable at all. */
  itemGroup: string
  /** ERP `Item Code` — matched against KPI items at compute time. */
  productCode: string
  productName?: string
  qty: number
  /** ERP `Total (Ex)`. Note the ERP prices packages: the whole order value
   *  usually sits on the main item's line and the bundled items are 0. */
  lineAmount: number
}

export interface SalesOrder {
  id: string
  orderNo: string
  /** hr_staff_costs.id of the salesperson. Unmatched orders never reach here. */
  staffId: string
  /** YYYY-MM-DD */
  orderDate: string
  /** YYYY-MM-DD — the event day used for Open Bill (1st/2nd/3rd) grouping. */
  eventDate: string
  lines: SalesLine[]
}

// ─── Configuration ──────────────────────────────────────────────────────────

/**
 * Whether an ERP item group's revenue counts toward commission.
 * User decision 2026-08-31: TRANS (transport charges) and OTHER (disposal,
 * miscellaneous) are NOT commissionable; ACC (accessories) IS.
 */
export interface ItemGroupRule {
  group: string
  commissionable: boolean
}

/** A product that pays a flat KPI allowance instead of counting as revenue. */
export interface KpiItem {
  productCode: string
  /** RM per unit, e.g. 50 or 60. */
  kpiAmount: number
}

/** Ladder rung: sell `minQty` KPI units or more → uplift the whole KPI base. */
export interface KpiThreshold {
  minQty: number
  /** 0.20 = +20%. */
  bonusPct: number
}

export type OpenBillRank = 1 | 2 | 3

export interface OpenBillRule {
  rank: OpenBillRank
  /** 0.50 for the 1st bill of the day, 0.40 for the 2nd, 0.30 for the 3rd. */
  pct: number
}

/** Manual pick: this order is that salesperson's Nth bill of the event day. */
export interface OpenBillTag {
  orderId: string
  rank: OpenBillRank
}

/** One person's payroll-purpose position for the period being computed. */
export interface HierarchyNode {
  staffId: string
  /** null = top of a tree. */
  uplineStaffId: string | null
  /** e.g. 'revenue_specialist' | 'team_assistant' | 'team_leader' | 'senior_team_leader' */
  tierKey: string
  /** The (tier, rate) pair, e.g. 'rs_6' — rates overlap across tiers. */
  rankKey: string
  /** 0.07 = 7% of commissionable product revenue. */
  productRate: number
  /**
   * Whether this rank may hold downlines at all. A Revenue Specialist on 5%
   * may not recruit; reaching 6% unlocks it (user brief 2026-08-31).
   */
  canRecruit: boolean
}

export interface CommissionScheme {
  /**
   * How the Open Bill bonus is based (confirmed 2026-08-31):
   *  - 'uplift_on_commission' → orderRevenue × personalRate × billPct.
   *    "10,000 at 7% → compute the 7% first, then add 50%" → 700 + 350.
   *  - 'pct_of_revenue' → orderRevenue × billPct. Kept as a documented
   *    alternative; no sub-department uses it today.
   */
  openBillBasis: 'uplift_on_commission' | 'pct_of_revenue'
  /** Whether KPI-item revenue counts toward a downline's override base. */
  overrideIncludesKpi: boolean
  /** Per-component switches, so another sub-department can reuse a subset. */
  enableProductRevenue: boolean
  enableKpi: boolean
  enableOpenBill: boolean
  enableOverride: boolean
  /**
   * Item-group allowlist. A group absent from this list is NOT commissionable
   * and raises a warning — a new ERP group must be classified by a human
   * before it can silently start (or stop) paying commission.
   */
  itemGroups: ItemGroupRule[]
}

export interface EngineInput {
  /** YYYY-MM-01. Commission settles per calendar month (user, 2026-08-31). */
  periodMonth: string
  scheme: CommissionScheme
  orders: SalesOrder[]
  kpiItems: KpiItem[]
  kpiThresholds: KpiThreshold[]
  openBillRules: OpenBillRule[]
  openBillTags: OpenBillTag[]
  hierarchy: HierarchyNode[]
}

// ─── Results ────────────────────────────────────────────────────────────────

export type CommissionComponent =
  | 'product_revenue'
  | 'kpi_item'
  | 'kpi_threshold'
  | 'open_bill'
  | 'override'

/**
 * One traceable contribution to a statement. The invariant the RPC enforces:
 * Σ lines.amount === statement.totalCommission, for every statement.
 */
export interface StatementLine {
  component: CommissionComponent
  sourceOrderId?: string
  sourceLineId?: string
  /** The downline whose volume produced an override line. */
  sourceStaffId?: string
  basisAmount: number
  rate: number | null
  qty: number | null
  amount: number
  note: string
}

export interface Statement {
  staffId: string
  tierKey: string | null
  rankKey: string | null
  productRate: number
  uplineStaffId: string | null

  /** Commissionable product revenue: excludes KPI items and excluded groups. */
  productRevenue: number
  /** Revenue that was dropped because its item group isn't commissionable. */
  excludedRevenue: number
  productCommission: number

  kpiQty: number
  kpiBase: number
  kpiThresholdPct: number
  kpiCommission: number

  openBillBonus: number
  overrideCommission: number
  totalCommission: number

  lines: StatementLine[]
}

export interface EngineResult {
  periodMonth: string
  statements: Statement[]
  totalCommission: number
  /**
   * Non-fatal problems a human must look at before applying the run — e.g. a
   * salesperson with sales but no rank, an unclassified ERP item group, or a
   * non-recruiting rank that somehow holds downlines. Surfaced on the run
   * dashboard; the Apply button is disabled while any warning stands.
   */
  warnings: string[]
}
