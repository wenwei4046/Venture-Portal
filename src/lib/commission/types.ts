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
  /**
   * Which brand's margin ladder this line answers to (Akemi / Zanotti /
   * Ergotex). Margin thresholds and incentives are per brand, and a single
   * sales order never crosses brands (user 2026-08-31).
   */
  brandCode?: string
  /**
   * Cost of goods for this line, used for margin. **The ERP sales-order export
   * carries no cost column**, so this is undefined until a cost source exists —
   * the engine then skips the margin penalty and says so in the warnings
   * rather than quietly paying full commission on a bad-margin bill.
   */
  costAmount?: number
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

export type MarginBandKind =
  /** margin at or ABOVE `marginPct` → pays `monthlyIncentive`, cumulative. */
  | 'incentive'
  /** a named reference level ("standard", "low") with no money attached. */
  | 'reference'
  /** margin at or BELOW `marginPct` → that bill's commission × `commissionMultiplier`. */
  | 'penalty'

/**
 * One rung of a brand's margin ladder (user brief 2026-08-31). Thresholds are
 * per BRAND because what counts as a good margin differs — Akemi's incentive
 * Tier 1 is 36% where Zanotti's is 33%.
 *
 * The worked example the user gave, for one brand:
 *
 *   incentive tier 2   43%   → a further RM1,500  (RM2,500 in total)
 *   incentive tier 1   36%   → RM1,000
 *   standard           33%   → reference only
 *   low                30%   → reference only
 *   below tier 1       27%   → that bill's commission x 50%
 *   below tier 2       25%   → x 25%
 *   below tier 3       24%   → x 0
 *
 * Incentives are evaluated on the salesperson's MONTHLY margin PER BRAND and
 * stack up the ladder — and EVERY brand they sold must clear a tier for them to
 * be entitled to it. Penalties are evaluated PER BILL and the most severe match
 * wins.
 */
export interface MarginBand {
  brandCode: string
  bandKey: string
  label: string
  kind: MarginBandKind
  /** 0.36 = 36%. Read as ">=" for incentive/reference, "<=" for penalty. */
  marginPct: number
  /** Penalty only. 0.5 keeps half the commission, 0 kills it. */
  commissionMultiplier: number
  /** Incentive only, INCREMENTAL: 1,000 at Tier 1 then a further 1,500 at Tier 2. */
  monthlyIncentive: number
}

/**
 * One rung of the tier ladder (user brief 2026-08-31, corrected):
 *   Revenue Specialist 5% → 6% · Team Assistant 7% → 8%
 *   Team Leader 9% · Senior Team Leader 10%
 * There is no 7% Revenue Specialist.
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
   * revenue plus their whole downline's. Only the 300k gate to Team Assistant
   * is live; the richer promotion criteria (consecutive months, KPI per head,
   * margin tier) are RECORDED in comm_promotion_rules but not yet enforced,
   * at the user's request. `null` = a rank that cannot be climbed to by volume.
   */
  groupSalesThreshold: number | null
  sortOrder: number
}

/**
 * fixed    — "flexible": whatever title a human drags them to is their title,
 *            and the rate stays there even in a month below target.
 * variable — "entitled to the scheme target": recomputed every month from that
 *            month's group sales, dropping back when the target is missed.
 */
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
  /** Below-margin penalty on a bill's own commission. */
  enableMarginPenalty: boolean
  /** Monthly margin incentive (RM1,000 / a further RM1,500). */
  enableMarginIncentive: boolean
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
  marginBands: MarginBand[]
  hierarchy: HierarchyNode[]
}

// ─── Results ────────────────────────────────────────────────────────────────

export type CommissionComponent =
  | 'product_revenue'
  | 'kpi_item'
  | 'kpi_threshold'
  | 'open_bill'
  | 'override'
  | 'margin_incentive'

/**
 * One traceable contribution to a statement. The invariant the RPC enforces:
 * Σ lines.amount === statement.totalCommission, for every statement.
 * A line's `amount` is already NET of any below-margin penalty.
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

/** One brand's slice of a salesperson's month. */
export interface BrandMargin {
  /** null only in the degenerate case of sales that carry no brand at all. */
  brandCode: string | null
  revenue: number
  cost: number
  /** null when cost data was missing for that brand. */
  marginPct: number | null
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

/** A bill whose margin fell into a penalty band. */
export interface PenalisedOrder {
  staffId: string
  orderId: string
  orderNo: string
  brandCode: string | null
  marginPct: number
  bandKey: string
  bandLabel: string
  multiplier: number
  /** Commission the penalty removed from this bill. */
  withheld: number
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
  /** Σ (each bill's revenue × its margin multiplier) — the base an upline
   *  overrides on, so a bill cut for bad margin cuts the override too. */
  penaltyWeightedRevenue: number
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

  /** Monthly margin across their eligible orders (goods only), all brands. */
  marginRevenue: number
  marginCost: number
  /** Blended across brands. null when cost data was missing anywhere. */
  marginPct: number | null
  /** Per-brand breakdown — the incentive is judged brand by brand. */
  marginByBrand: BrandMargin[]
  /** Highest incentive tier cleared by EVERY brand they sold. */
  marginBandKey: string | null
  /** RM1,000 / RM2,500 etc. Paid as its own statement line. */
  marginIncentive: number
  /** Memo: commission the below-margin penalty removed. Already reflected in
   *  the line amounts, so it is NOT part of totalCommission. */
  marginPenaltyWithheld: number

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
  /** Bills that lost commission to a below-margin penalty. */
  penalised: PenalisedOrder[]
  /**
   * Non-fatal problems a human must look at before applying the run — e.g. a
   * salesperson with sales but no rank, an unclassified ERP item group, a
   * non-recruiting rank that holds downlines, or missing cost data. Surfaced on
   * the run dashboard; the Apply button is disabled while any warning stands.
   */
  warnings: string[]
}
