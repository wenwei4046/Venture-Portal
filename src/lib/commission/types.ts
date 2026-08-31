/**
 * Revenue Department commission engine — input / output shapes.
 *
 * Deliberately free of Supabase types: the engine is pure so it can be
 * unit-tested against hand-worked examples with no database. The Server Action
 * is responsible for loading these shapes out of Postgres and posting the
 * result back through `apply_commission_run`.
 *
 * See docs/module-spec-revenue-commission.md §3 for the money rules.
 */

// ─── Imported facts ─────────────────────────────────────────────────────────

export interface SalesLine {
  id: string
  /** ERP product code — matched against KPI items at compute time. */
  productCode: string
  productName?: string
  qty: number
  /** Line revenue, already net of whatever discount the ERP applied. */
  lineAmount: number
}

export interface SalesOrder {
  id: string
  orderNo: string
  /** hr_staff_costs.id of the salesperson. Unmatched orders never reach here. */
  staffId: string
  /** YYYY-MM-DD */
  orderDate: string
  /** YYYY-MM-DD — the event day used for 1st/2nd/3rd Bill grouping. */
  eventDate: string
  lines: SalesLine[]
}

// ─── Configuration ──────────────────────────────────────────────────────────

/** A product that pays a flat KPI allowance instead of counting as revenue. */
export interface KpiItem {
  productCode: string
  /** RM per unit, e.g. pillow → 30. */
  kpiAmount: number
}

/** Ladder rung: sell `minQty` KPI units or more → uplift the whole KPI base. */
export interface KpiThreshold {
  minQty: number
  /** 0.20 = +20%. */
  bonusPct: number
}

export type BillRank = 1 | 2 | 3

export interface BillBonusRule {
  billRank: BillRank
  /** 0.50 for the 1st Bill, 0.40 for the 2nd, 0.30 for the 3rd. */
  pct: number
}

/** Manual pick: this order is that salesperson's Nth bill of the event day. */
export interface BillTag {
  orderId: string
  billRank: BillRank
}

/** One person's payroll-purpose position for the period being computed. */
export interface HierarchyNode {
  staffId: string
  /** null = top of a tree. */
  uplineStaffId: string | null
  rankKey: string
  /** 0.07 = 7% of product revenue. */
  productRate: number
}

export interface CommissionScheme {
  /**
   * How the 1st/2nd/3rd Bill bonus is based (spec Q1):
   *  - 'uplift_on_commission' → orderRevenue × personalRate × billPct
   *  - 'pct_of_revenue'       → orderRevenue × billPct
   */
  billBonusBasis: 'uplift_on_commission' | 'pct_of_revenue'
  /** Whether KPI-item revenue counts toward a downline's override base. */
  overrideIncludesKpi: boolean
}

export interface EngineInput {
  /** YYYY-MM-01 */
  periodMonth: string
  scheme: CommissionScheme
  orders: SalesOrder[]
  kpiItems: KpiItem[]
  kpiThresholds: KpiThreshold[]
  billBonusRules: BillBonusRule[]
  billTags: BillTag[]
  hierarchy: HierarchyNode[]
}

// ─── Results ────────────────────────────────────────────────────────────────

export type CommissionComponent =
  | 'product_revenue'
  | 'kpi_item'
  | 'kpi_threshold'
  | 'bill_bonus'
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
  rankKey: string | null
  productRate: number
  uplineStaffId: string | null

  productRevenue: number
  productCommission: number

  kpiQty: number
  kpiBase: number
  kpiThresholdPct: number
  kpiCommission: number

  billBonus: number
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
   * salesperson with sales but no rank, or a hierarchy cycle. Surfaced on the
   * run dashboard; the Apply button is disabled while any warning stands.
   */
  warnings: string[]
}
