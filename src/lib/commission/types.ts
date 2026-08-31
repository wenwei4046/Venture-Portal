/**
 * Revenue Department commission engine — input / output shapes.
 *
 * Deliberately free of Supabase types: the engine is pure so it can be
 * unit-tested against hand-worked examples with no database. The Server Action
 * loads these shapes out of Postgres and posts the result back through
 * `apply_commission_run`.
 *
 * Scope note (user brief 2026-08-31): the Revenue Department is divided into
 * SUB-DEPARTMENTS and each one calculates differently. The components modelled
 * here are the **Fair** sub-department's ruleset (the roadshow / event team).
 * A scheme belongs to a sub-department and can switch each component off, so a
 * future sub-department reuses what applies and drops what doesn't.
 *
 * See docs/module-spec-revenue-commission.md §4 for the money rules.
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
  /** YYYY-MM-01 of orderDate. Differs from the run's period for an order
   *  carried forward because its deposit only cleared later. */
  periodMonth: string
  /** YYYY-MM-DD — the event day used for Open Bill (1st/2nd/3rd) grouping. */
  eventDate: string
  /** ERP header `Total` — the deposit gate measures against this, not against
   *  the commissionable subset. */
  orderTotal: number
  /** Collected so far = orderTotal − ERP `BALANCE`. */
  paidAmount: number
  /** True when an earlier applied run already paid this order's commission.
   *  Guards the carry-forward path against double-paying. */
  alreadyReleased?: boolean
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

/**
 * One rung of the tier ladder (user brief 2026-08-31):
 *   Revenue Specialist 5% → 6% · Team Assistant 7% → 8%
 *   Team Leader 9% · Senior Team Leader 10%
 * Rates do not repeat, but the rank key is still the identity so a future
 * scheme can reuse a rate at two tiers.
 */
export interface Rank {
  rankKey: string
  tierKey: string
  tierLabel: string
  label: string
  /** 0.07 = 7% of commissionable product revenue. */
  productRate: number
  /** A Revenue Specialist on 5% may not hold downlines; 6% unlocks it. */
  canRecruit: boolean
  /**
   * GROUP sales needed to hold this rank — the person's own commissionable
   * revenue plus their whole downline's. 300,000 promotes a 6% Revenue
   * Specialist to Team Assistant 7%. `null` = an entry rank that cannot be
   * climbed to by volume.
   */
  groupSalesThreshold: number | null
  sortOrder: number
}

export type RateMode = 'fixed' | 'variable'

/** One person's payroll-purpose position for the period being computed. */
export interface HierarchyNode {
  staffId: string
  /** null = top of a tree. */
  uplineStaffId: string | null
  /**
   * The rank they have ATTAINED. In `fixed` mode this is the whole story; in
   * `variable` mode it is the floor they can never drop below.
   */
  baseRankKey: string
  /**
   * fixed    — once promoted, the rate stays even in a month that misses the
   *            target ("升到 7% 之后即使没达到 300k 依然 fixed 在 7%").
   * variable — recomputed every month from that month's group sales; misses
   *            the target and the rate drops back to the base rank.
   */
  rateMode: RateMode
}

export interface CommissionScheme {
  /**
   * How the Open Bill bonus is based (confirmed 2026-08-31):
   *  - 'uplift_on_commission' → orderRevenue × personalRate × billPct.
   *    "10,000 at 7% → compute the 7% first, then add 50%" → 700 + 350.
   *  - 'pct_of_revenue' → orderRevenue × billPct. A documented alternative;
   *    no sub-department uses it today.
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
  /**
   * Fraction of the order total the customer must have paid before ANY of
   * that order's commission is released. 0.5 = half. `null` disables the gate.
   * An order below it is deferred, not lost: it pays in the month its deposit
   * finally clears.
   */
  depositThresholdPct: number | null
  /** Applied to a salesperson who has no explicit rateMode of their own. */
  defaultRateMode: RateMode
}

export interface EngineInput {
  /** YYYY-MM-01 — commission settles per calendar month. */
  periodMonth: string
  scheme: CommissionScheme
  ranks: Rank[]
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

/** An order held back because its deposit has not reached the threshold. */
export interface DeferredOrder {
  staffId: string
  orderId: string
  orderNo: string
  orderDate: string
  orderTotal: number
  paidAmount: number
  requiredAmount: number
  /** Commissionable revenue that is waiting on the top-up. */
  productRevenue: number
}

export interface Statement {
  staffId: string

  /** What they have attained; the floor in variable mode. */
  baseRankKey: string | null
  rateMode: RateMode
  /** The rank actually used this month, after the variable-rate resolution. */
  effectiveRankKey: string | null
  tierKey: string | null
  productRate: number
  /** Set when group sales qualify them for a rank above their base — the
   *  promotion prompt for a fixed-rate person, already applied for a variable. */
  qualifiesForRankKey: string | null

  uplineStaffId: string | null

  /** Own commissionable revenue: excludes KPI items, excluded groups, and
   *  orders held by the deposit gate. */
  productRevenue: number
  /** Own + entire downline subtree — what the promotion threshold measures. */
  groupRevenue: number
  /** Revenue dropped because its item group isn't commissionable. */
  excludedRevenue: number
  /** Revenue waiting on a deposit top-up. */
  deferredRevenue: number
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
  /** Orders held back by the deposit gate, so the run dashboard can show how
   *  much commission is waiting on collections. */
  deferred: DeferredOrder[]
  /**
   * Non-fatal problems a human must look at before applying the run — e.g. a
   * salesperson with sales but no rank, an unclassified ERP item group, or a
   * non-recruiting rank that somehow holds downlines. Surfaced on the run
   * dashboard; the Apply button is disabled while any warning stands.
   */
  warnings: string[]
}
