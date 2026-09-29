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

import type { IrGroup } from './ir-groups'
import type { KpiItem } from './kpi'
import type { CostRatio } from './cost-basis'

export type { KpiItem, KpiOptionPool } from './kpi'
export type { CostRatio } from './cost-basis'

// ─── Imported facts ─────────────────────────────────────────────────────────

export interface SalesLine {
  id: string
  /** ERP `Item Group`, e.g. MATTRESS / SOFA / ACC / TRANS. Drives whether the
   *  line's revenue is commissionable at all. */
  itemGroup: string
  /** ERP `Item Code` — matched against KPI items and cost ratios at compute time. */
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
  /**
   * The specials the line carries as printed (`parseLineFacts`: the ERP's
   * `raw.variants`, else its `description2` grammar) — how a bed frame's HB
   * Straight or a sofa's Wooden Arm is found as a KPI item. Loaded for bed
   * frame and sofa lines only; absent = none.
   */
  specials?: string[]
  /**
   * The one line of an upsale HR recorded by hand (`comm_upsales`, 2026-09-24).
   * Always commissionable whatever the scheme's item groups say, never a KPI
   * item, and never part of a margin — it carries no cost and it is not goods
   * the ERP billed.
   */
  upsale?: boolean
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
  /**
   * Margin keyed in by hand for this one bill, 0.36 = 36%.
   *
   * This is the stop-gap while the Product List fills up (user 2026-08-31):
   * until every Item Code has a unit cost, a human can type the margin on the
   * order and the penalty applies immediately. It OVERRIDES anything derived
   * from line costs, so a correction by hand always wins.
   */
  manualMarginPct?: number | null
  /**
   * The brand the bill was written under — the ERP's Branding on the document
   * (`sales_orders.brand_code`). It alone chooses the margin ladder (user
   * 2026-09-27: 主体是 Akemi 就跟 Akemi 的 margin ladder). A pillow of another
   * brand given away, a bed frame, any accessory: riders — their cost counts
   * in this bill's margin, measured on this brand's ladder. Absent (a bed
   * frame on its own, an old import) = the lines decide, as they always did.
   */
  brandCode?: string | null
  /**
   * An upsale HR recorded by hand (`comm_upsales`, 2026-09-24), not an ERP
   * bill: a customer added to an order whose commission was already paid, and
   * only the added amount earns (user: 跟着 upsells 的 amount 来算). It is paid
   * in the month it is recorded under — HR records it once it is paid, so the
   * deposit gate does not ask — and like any sale it counts toward the upline's
   * override. It is never an Open Bill, never released, and never carried.
   */
  upsale?: boolean
  /**
   * Set on every part of a SHARED bill, the owner's included
   * (`splitOrdersByShares`, 2026-09-30): whose bill it is and who holds which
   * part. Display only — the engine pays each part as the ordinary bill it is,
   * and never reads this.
   */
  share?: BillShare
  lines: SalesLine[]
}

/** Who holds a shared bill (`sales_order_shares`), as every one of its parts carries it. */
export interface BillShare {
  /** The bill's own salesperson — the name the ERP put on it. */
  ownerStaffId: string
  /** Every holder with their part, the owner first; the parts add up to 1. */
  parts: { staffId: string; pct: number }[]
  /** The whole bill's total, before it was split. */
  wholeTotal: number
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
 *
 * Every rung belongs to a TITLE (Team → Role & Permission). The rank is what
 * a month pays; the title is what a person keeps — see `titles.ts`.
 */
export interface Rank {
  rankKey: string
  /** `titles.id` this rung belongs to. Several rungs may share one. */
  titleId: string
  titleLabel: string
  label: string
  /** 0.07 = 7% of commissionable product revenue. */
  productRate: number
  /** Fixed reward for each qualifying direct-line group; replaces percentage pay. */
  groupIncentiveAmount?: number
  /** Non-cash Claims cap per qualifying group, excluded from commission/payroll. */
  groupSubsidyCap?: number
  /**
   * A Revenue Specialist on 5% may not hold downlines; 6% unlocks it.
   * Read through the TITLE (`titleCanRecruit`), not the month's rank, so a
   * Team Assistant who slips back for a month keeps their team.
   */
  canRecruit: boolean
  /**
   * MONTHLY gate into this rung: GROUP sales this month — the person's own
   * commissionable revenue plus their whole downline's. Paid this rung in a
   * month that clears it, back to the floor in one that does not (the 300k
   * gate to Team Assistant). `null` = no monthly gate.
   */
  groupSalesThreshold: number | null
  /**
   * EARNED gate into this rung (user 2026-09-03, spec Q11): own commissionable,
   * deposit-cleared revenue at or above this in `consecutiveMonths` months in
   * a row, this one included — 100k × 2 → Senior Revenue Specialist. Passing
   * it raises the title for good, and from then on the engine climbs from
   * this rung rather than from the rung they were placed at. A rung carries
   * at most one gate; the richer criteria (KPI per head, margin tier) stay
   * RECORDED in comm_promotion_rules, not enforced.
   */
  personalSalesThreshold: number | null
  consecutiveMonths: number | null
  sortOrder: number
}

/**
 * One earlier month's own commissionable revenue per salesperson — the
 * earlier runs' `product_revenue`, which is what a streak gate looks back at.
 * Absent month = no run was made for it, and a streak cannot cross it.
 */
export interface PriorMonth {
  /** YYYY-MM-01 */
  periodMonth: string
  personalRevenue: Record<string, number>
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
  /**
   * The title they HOLD (`hr_staff_costs.title_id`) — the ratchet. Decides
   * whether they may recruit and whether this month's rank would raise it.
   * `null` when nobody has given them one yet; the base rank answers instead.
   */
  titleId: string | null
}

export interface CommissionScheme {
  /** Null/absent keeps Fair's whole-tree group sales. IR counts two generations. */
  groupSalesDepth?: number | null
  /** Null/absent keeps Fair's unlimited differential override. */
  overrideDepth?: number | null
  /** Enable monthly direct-line packages and their percentage fallback. */
  enableGroupIncentive?: boolean
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
  /**
   * Revenue Team cost = a line's cost ÷ this (user 2026-09-12: "cost / 0.7 =
   * revenue fair department team cost"). Every margin the engine judges —
   * per-bill penalty, monthly incentive, the statement's brand margins — is
   * taken on that cost, the same basis the member calculator shows. Absent
   * or 1 keeps the cost as imported.
   */
  costDivisor?: number
  /**
   * SKUs whose cost is divided by their OWN ratio instead (Product List ›
   * Costing Setting, 2026-09-27: some SKUs divide by 0.6). Matched on the
   * line's product code. Absent = every line at `costDivisor`.
   */
  costRatios?: CostRatio[]
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
  /**
   * The months before this one, most recent first, as far back as the
   * longest streak gate on the ladder needs. Empty when nothing was run
   * before — the first month a sub-department runs, no streak can pass.
   */
  priorMonths: PriorMonth[]
  /**
   * Whoever holds a title that HEADS the department — a Revenue Director
   * (`titles.is_department_head`). They hold no membership and earn no
   * override; the run does not flag them as missing a rank. What they ARE
   * paid is `directors` (2026-09-27): without an entry there, a bill they sell
   * is theirs and earns nothing (the 2026-09-19 rule).
   */
  departmentHeadIds?: string[]
  /**
   * What each department head is paid here (user 2026-09-27): their own bills
   * at the rank of their title's rung on this ladder — that rate and nothing
   * else — plus the Directors tab's fixed amount and, once the month's
   * Commissionable value reaches the threshold, its incentive. Absent = the
   * heads earn nothing.
   */
  directors?: DirectorTerms[]
  /**
   * The month's Commissionable value — Comm Cal's card, the directors'
   * incentive threshold measure (`monthCommissionableValue`). Absent while no
   * director has an incentive to judge.
   */
  monthCommissionableValue?: number
}

/** One department head's pay in this sub-department (Rules › Directors). */
export interface DirectorTerms {
  staffId: string
  /** The rank their title's rung on this ladder holds; null = no rung, own bills earn nothing. */
  rankKey: string | null
  /** Their base commission, every month. */
  fixedAmount: number
  /** The month's Commissionable value at which the incentive is paid; null = none. */
  salesThreshold: number | null
  incentiveAmount: number
}

// ─── Results ────────────────────────────────────────────────────────────────

export type CommissionComponent =
  | 'product_revenue'
  | 'kpi_item'
  | 'kpi_threshold'
  | 'open_bill'
  | 'override'
  | 'margin_incentive'
  | 'group_incentive'
  /** A director's fixed amount (Rules › Directors, 2026-09-27). */
  | 'director_fixed'
  /** A director's incentive: the month's Commissionable value reached the threshold. */
  | 'director_incentive'

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

/** Where a bill's margin came from. */
export type MarginSource = 'manual' | 'cost' | 'none'

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
  marginSource: MarginSource
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
  /** The title that rank belongs to. */
  rankTitleId: string | null
  /**
   * The title this month would raise them to when the run is applied, or
   * null when the paid rank's title is not above the one they hold. A
   * preview: `apply_commission_run` decides from the live record.
   */
  promotesToTitleId: string | null
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
  /** Cash fixed group rewards; included in totalCommission. */
  groupIncentive?: number
  /** Non-cash benefit cap, never part of totalCommission. */
  groupSubsidyCap?: number
  /** One independent target per direct; own sales may appear in each target. */
  groupBreakdown?: IrGroup[]
  /** Three qualifying direct groups, each with three immediate reports. */
  fullSpec?: boolean
  /** Memo: commission the below-margin penalty removed. Already reflected in
   *  the line amounts, so it is NOT part of totalCommission. */
  marginPenaltyWithheld: number
  /** A director's fixed amount; included in totalCommission (2026-09-27). */
  directorFixed?: number
  /** A director's threshold incentive; included in totalCommission. */
  directorIncentive?: number

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
