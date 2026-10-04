/**
 * Revenue Department commission engine — pure math, no I/O.
 *
 * Implements the **Fair** sub-department's ruleset (user briefs 2026-08-31).
 * Computed per salesperson per calendar month, in six passes because each one
 * depends on the last:
 *
 *   A  classify lines, apply the DEPOSIT GATE, get each person's own revenue
 *   B  GROUP revenue — own + the whole downline subtree
 *   C  resolve the EFFECTIVE RATE (fixed vs variable, off group revenue)
 *   D  C1 product revenue · C2 KPI items · C3 Open Bill,
 *      each bill scaled by its BELOW-MARGIN PENALTY
 *   E  C4 override, on the PENALTY-WEIGHTED revenue of each downline
 *   F  the monthly MARGIN INCENTIVE, which every brand must clear
 *
 * Rounding rule: every statement LINE is rounded to 2dp, and every subtotal is
 * the sum of its rounded lines. That makes `Σ lines === total` exact, which is
 * the invariant the drill-down page and the apply RPC both rely on.
 *
 * See docs/module-spec-revenue-commission.md §4.
 */

import type {
  BrandMargin,
  CommissionComponent,
  DeferredOrder,
  EngineInput,
  EngineResult,
  HierarchyNode,
  ItemGroupRule,
  KpiThreshold,
  MarginBand,
  MarginSource,
  OpenBillRank,
  PenalisedOrder,
  PriorMonth,
  Rank,
  SalesLine,
  SalesOrder,
  Statement,
  StatementLine,
} from './types'
import { earnedFloor, promotesTo, titleCanRecruit } from './titles'
import { computeIrGroups, type IrGroupsResult } from './ir-groups'
import { directorIncentiveEarned } from './director-pay'
import {
  EMPTY_KPI_INDEX,
  coverKpi,
  indexKpiItems,
  kpiAmountOf,
  kpiItemLabel,
  orderKpiHits,
  type KpiHit,
  type KpiIndex,
} from './kpi'
import { costBasisOf, costDivisorFor, type CostBasis } from './cost-basis'

export * from './types'
export { EMPTY_KPI_INDEX, indexKpiItems, orderKpiHits, type KpiHit, type KpiIndex } from './kpi'
export { costBasisOf, costDivisorFor, type CostBasis } from './cost-basis'

/** Guards against a hierarchy cycle that slipped past the DB trigger. */
const MAX_UPLINE_DEPTH = 20

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function sum(ns: number[]): number {
  return round2(ns.reduce((a, b) => a + b, 0))
}

export function normaliseCode(code: string): string {
  return code.trim().toUpperCase()
}

// ─── Line classification ────────────────────────────────────────────────────

export function indexItemGroups(rules: ItemGroupRule[]): Map<string, boolean> {
  return new Map(rules.map(r => [normaliseCode(r.group), r.commissionable]))
}

/**
 * Whether a line's item group earns commission. KPI items are not a class of
 * line (2026-09-27): a bill CARRIES them — a SKU, or a special printed on a
 * bed frame or sofa — and their amounts come off the bill as a whole
 * (`orderRevenueSplit`), whatever line they sit on.
 */
export type LineClass = 'commissionable' | 'excluded_group' | 'unknown_group'

export function classifyLine(line: SalesLine, groupIndex: Map<string, boolean>): LineClass {
  // An upsale HR recorded is commissionable by definition: it is the amount
  // the salesperson added, whatever group the scheme would put it in.
  if (line.upsale) return 'commissionable'
  const known = groupIndex.get(normaliseCode(line.itemGroup))
  if (known === undefined) return 'unknown_group'
  return known ? 'commissionable' : 'excluded_group'
}

/** The goods a margin is judged on: commissionable groups, never an upsale. */
function inGoodsScope(line: SalesLine, groupIndex: Map<string, boolean>): boolean {
  // An upsale carries no cost and is not goods the ERP billed; judging a
  // margin on it would only block the month's incentive.
  if (line.upsale) return false
  return classifyLine(line, groupIndex) === 'commissionable'
}

export interface RevenueSplit {
  /** Σ the bill's commissionable lines, as billed. */
  commissionable: number
  /** Every KPI item the bill carries. */
  foundHits: KpiHit[]
  /** The ones paid on it: all of them, or none when its sales cannot cover them. */
  kpiHits: KpiHit[]
  /** What the paid ones take off: Σ qty × each item's amount — paid as KPI instead. */
  kpiAmount: number
  /** What the rate is paid on: commissionable − kpiAmount. */
  main: number
  /** It carries KPI items its sales do not cover: none is paid, it is paid as sales. */
  uncovered: boolean
}

/**
 * One bill, split (user 2026-09-27): a RM 10,000 bill carrying HB Straight at
 * RM 200 is 9,800 of main sales — the rate is paid on it, its margin judged on
 * it — and RM 200 paid flat as KPI. The ERP cannot say how much of a bill an
 * add-on is (its line is RM 0 on most bills), so the item's own amount is
 * what comes off.
 */
export function orderRevenueSplit(
  order: Pick<SalesOrder, 'lines' | 'upsale'>,
  kpiIndex: KpiIndex,
  groupIndex: Map<string, boolean>,
): RevenueSplit {
  const commissionable = sum(
    order.lines.filter(l => classifyLine(l, groupIndex) === 'commissionable').map(l => l.lineAmount),
  )
  const foundHits = orderKpiHits(order, kpiIndex)
  const { main, covered } = coverKpi(commissionable, kpiAmountOf(foundHits))
  const kpiHits = covered ? foundHits : []
  return { commissionable, foundHits, kpiHits, kpiAmount: kpiAmountOf(kpiHits), main, uncovered: !covered }
}

/** Product revenue of one order: its commissionable sales less its KPI items. */
export function orderProductRevenue(
  order: Pick<SalesOrder, 'lines' | 'upsale'>,
  kpiIndex: KpiIndex,
  groupIndex: Map<string, boolean>,
): number {
  return orderRevenueSplit(order, kpiIndex, groupIndex).main
}

// ─── Deposit gate ───────────────────────────────────────────────────────────

/**
 * An order pays no commission at all until the customer has deposited the
 * configured share of the ORDER TOTAL — 50% of a 10,000 order means 5,000 must
 * be in before any of it counts (user brief 2026-08-31). The gate measures
 * against the ERP header total, not the commissionable subset, because that is
 * what the customer was invoiced.
 *
 * Nothing is lost: a deferred order simply pays in the month its deposit
 * clears, which is why `SalesOrder.alreadyReleased` exists.
 */
export function depositRequired(orderTotal: number, thresholdPct: number | null): number {
  if (thresholdPct === null) return 0
  return round2(orderTotal * thresholdPct)
}

export function isDepositMet(order: SalesOrder, thresholdPct: number | null): boolean {
  if (thresholdPct === null) return true
  if (order.orderTotal <= 0) return true
  return order.paidAmount + 0.005 >= depositRequired(order.orderTotal, thresholdPct)
}

// ─── KPI threshold ladder ───────────────────────────────────────────────────

/**
 * Highest rung whose minQty is met. Rungs need not be sorted by the caller.
 * Returns 0 when nothing is met.
 */
export function kpiThresholdPct(qty: number, thresholds: KpiThreshold[]): number {
  let best = 0
  for (const t of thresholds) {
    if (qty >= t.minQty && t.bonusPct > best) best = t.bonusPct
  }
  return best
}

// ─── Margin ─────────────────────────────────────────────────────────────────

export interface MarginBase {
  revenue: number
  cost: number
  /** false when at least one line in scope had no cost — margin is unknowable. */
  complete: boolean
  /**
   * The brand whose margin ladder the bill answers to: the brand it was
   * written under (`SalesOrder.brandCode`), else what its lines say.
   */
  brandCode: string | null
  /**
   * true when a bill with no brand of its own SELLS more than one brand, so
   * which ladder it answers to is a guess. A bill written under a brand never
   * is — whatever else rides on it (2026-09-27). Nor is a gift of another
   * brand at RM 0 on a bill that has none.
   */
  mixedBrand: boolean
}

/**
 * Margin base of a set of lines: revenue and cost of the GOODS only.
 *
 * Transport and disposal are excluded — they are pass-through service charges
 * and are not commissionable either. A free bundled item IS included: a
 * giveaway pillow has real cost and no revenue, which is exactly how giving
 * them away is supposed to hurt the margin.
 *
 * The revenue is the bill's MAIN sales (2026-09-27): what its KPI items take
 * off is paid flat as KPI and is not the main product's price, so a RM 10,000
 * bill with HB Straight at RM 200 is judged on 9,800 — the items' cost stays.
 * Less, too, what its bed frames' divan, leg and gap were CHARGED
 * (`SalesLine.optionCharge`, 2026-10-05): a RM 10,000 bill with a 6" leg at
 * RM 100 is judged on 9,900 against a cost that never had the leg in it, and
 * its rate is still paid on 10,000. Every line's cost is divided by its own
 * SKU's ratio, else the sub-department's (`cost-basis.ts`).
 *
 * Every line counts toward the margin, whatever brand it carries: the ladder
 * is the BILL's (user 2026-09-27 — an Akemi bill that gives away a
 * Dunlopillo pillow is measured on Akemi's ladder, the pillow's cost in it; a
 * Dunlopillo bill with the same pillow, on Dunlopillo's). A bed frame or an
 * accessory is a rider: it follows the brand of the bill it is sold on.
 */
export function marginBase(
  lines: SalesLine[],
  kpiIndex: KpiIndex,
  groupIndex: Map<string, boolean>,
  /** Revenue Team basis: a line's cost ÷ its ratio. A number is the one default. */
  costBasis: CostBasis | number = 1,
  /** The brand the bill was written under, when it has one. */
  orderBrand: string | null = null,
): MarginBase {
  let revenue = 0
  let cost = 0
  let charges = 0
  let complete = true
  const byBrand = new Map<string, number>()
  const basis = typeof costBasis === 'number' ? costBasisOf(costBasis) : costBasis
  // The brands the customer paid for — a free gift carries its brand at RM 0.
  const sold = new Set<string>()

  for (const line of lines) {
    if (!inGoodsScope(line, groupIndex)) continue
    revenue = round2(revenue + line.lineAmount)
    charges = round2(charges + (line.optionCharge ?? 0))
    if (line.costAmount === undefined || line.costAmount === null) complete = false
    else cost = round2(cost + line.costAmount / costDivisorFor(line.productCode, basis))
    if (line.brandCode) {
      byBrand.set(line.brandCode, round2((byBrand.get(line.brandCode) ?? 0) + line.lineAmount))
      if (line.lineAmount > 0) sold.add(line.brandCode)
    }
  }
  if (kpiIndex.size > 0) revenue = coverKpi(revenue, kpiAmountOf(orderKpiHits({ lines }, kpiIndex))).main
  // What its bed frames' divan, leg and gap were charged is the customer's
  // price for an option, not the product's (2026-10-05): out of the margin on
  // both sides — it was never in the cost — while the rate is still paid on it.
  revenue = round2(revenue - charges)

  // The bill's own brand decides; the lines only speak for a bill without one.
  if (orderBrand) return { revenue, cost, complete, brandCode: orderBrand, mixedBrand: false }

  let brandCode: string | null = null
  let best = -Infinity
  for (const [brand, rev] of byBrand) {
    if (rev > best) {
      best = rev
      brandCode = brand
    }
  }

  // Nothing priced at all (a rider carries the bill, every branded line is a
  // gift): two brands on it are still two ladders to choose between.
  const mixedBrand = sold.size > 1 || (sold.size === 0 && byBrand.size > 1)
  return { revenue, cost, complete, brandCode, mixedBrand }
}

/** (revenue − cost) / revenue, or null when it cannot be known. */
export function marginPctOf(base: { revenue: number; cost: number; complete: boolean }): number | null {
  if (!base.complete) return null
  if (base.revenue <= 0) return null
  return (base.revenue - base.cost) / base.revenue
}

export interface BillMargin {
  pct: number | null
  source: MarginSource
  /** Cost to fold into the month's per-brand blend. Derived from the manual
   *  percentage when that is what was used, so the monthly figure stays
   *  consistent with the per-bill one. */
  cost: number
}

/**
 * One bill's margin. A hand-keyed percentage WINS over anything derived from
 * line costs (user 2026-08-31): the Product List is being filled in over time,
 * and a human correction on the order must not be silently overruled by a
 * stale or partial cost table.
 *
 * When the manual figure is used, the implied cost `revenue × (1 − margin)` is
 * what feeds the month's per-brand blend, so the monthly margin agrees with
 * the bills it is made of.
 */
export function billMargin(order: SalesOrder, base: MarginBase): BillMargin {
  const manual = order.manualMarginPct
  if (manual !== undefined && manual !== null && Number.isFinite(manual)) {
    return { pct: manual, source: 'manual', cost: round2(base.revenue * (1 - manual)) }
  }
  const derived = marginPctOf(base)
  if (derived === null) return { pct: null, source: 'none', cost: 0 }
  return { pct: derived, source: 'cost', cost: base.cost }
}

/**
 * Below-margin penalty for one bill. Penalty bands are read as "margin at or
 * BELOW this threshold", and the MOST SEVERE match wins — so with the user's
 * ladder (27% → x0.5, 25% → x0.25, 24% → x0):
 *
 *   26% → only the 27% band matches      → x 0.50
 *   25% → the 27% and 25% bands match    → x 0.25
 *   24% → all three match                → x 0
 *   28% → nothing matches                → x 1 (no penalty)
 */
export function penaltyBandFor(
  marginPct: number,
  brandCode: string | null,
  bands: MarginBand[],
): MarginBand | null {
  let worst: MarginBand | null = null
  for (const b of bands) {
    if (b.kind !== 'penalty') continue
    if (brandCode !== null && b.brandCode !== brandCode) continue
    if (marginPct > b.marginPct + 1e-9) continue
    if (!worst || b.marginPct < worst.marginPct) worst = b
  }
  return worst
}

export interface IncentiveResult {
  amount: number
  bandKey: string | null
  bandLabel: string | null
  /** Set when the incentive could not be judged at all. */
  blockedReason: string | null
}

/** Incentive bands of one brand that a margin clears, by band key. */
function clearedBandKeys(
  marginPct: number,
  brandCode: string,
  bands: MarginBand[],
): Set<string> {
  const cleared = new Set<string>()
  for (const b of bands) {
    if (b.kind !== 'incentive' || b.brandCode !== brandCode) continue
    if (marginPct + 1e-9 >= b.marginPct) cleared.add(b.bandKey)
  }
  return cleared
}

function brandHasIncentiveBands(brandCode: string, bands: MarginBand[]): boolean {
  return bands.some(b => b.kind === 'incentive' && b.brandCode === brandCode)
}

/**
 * The monthly margin incentive.
 *
 * Thresholds follow the BRAND, and **every brand the salesperson sold that
 * month must clear the tier** (user brief 2026-08-31): three weekends of a
 * brand at Tier 2 and a fourth weekend of another brand below it does NOT earn
 * Tier 2. The entitled tiers are therefore the INTERSECTION of what each
 * brand's own monthly margin clears, and the amounts stack up that
 * intersection — RM1,000 at Tier 1, a further RM1,500 at Tier 2.
 *
 * Anything that makes a brand unjudgeable (no cost data, no ladder configured,
 * no brand on the order at all) blocks the whole incentive and says why, rather
 * than quietly paying on the brands that happen to be judgeable.
 */
export function marginIncentiveAcrossBrands(
  brands: BrandMargin[],
  bands: MarginBand[],
): IncentiveResult {
  const none: IncentiveResult = { amount: 0, bandKey: null, bandLabel: null, blockedReason: null }
  if (brands.length === 0) return none

  const unbranded = brands.find(b => !b.brandCode)
  if (unbranded) {
    return { ...none, blockedReason: 'some sales carry no brand' }
  }
  const noMargin = brands.find(b => b.marginPct === null)
  if (noMargin) {
    return { ...none, blockedReason: `no cost data for ${noMargin.brandCode}` }
  }
  const noLadder = brands.find(b => !brandHasIncentiveBands(b.brandCode!, bands))
  if (noLadder) {
    return { ...none, blockedReason: `no incentive ladder configured for ${noLadder.brandCode}` }
  }

  // Intersect what each brand clears: a tier counts only if EVERY brand got there.
  let entitled = clearedBandKeys(brands[0].marginPct!, brands[0].brandCode!, bands)
  for (const b of brands.slice(1)) {
    const cleared = clearedBandKeys(b.marginPct!, b.brandCode!, bands)
    entitled = new Set([...entitled].filter(k => cleared.has(k)))
  }
  if (entitled.size === 0) return none

  // Amounts should agree across brands; take the lowest if they ever disagree.
  let amount = 0
  let top: { key: string; label: string; pct: number } | null = null
  for (const key of entitled) {
    const defs = bands.filter(b => b.kind === 'incentive' && b.bandKey === key)
    amount = round2(amount + Math.min(...defs.map(d => d.monthlyIncentive)))
    const pct = Math.max(...defs.map(d => d.marginPct))
    if (!top || pct > top.pct) top = { key, label: defs[0].label, pct }
  }

  return { amount, bandKey: top?.key ?? null, bandLabel: top?.label ?? null, blockedReason: null }
}

// ─── Group revenue ──────────────────────────────────────────────────────────

/**
 * Own commissionable revenue plus the entire downline subtree's — what the
 * promotion threshold measures. The brief's example: a Revenue Specialist with
 * 200k of their own and two downlines on 100k each has group sales of 400k,
 * which clears the 300k gate for Team Assistant.
 *
 * This is a SALES figure, so it is the raw revenue: a below-margin penalty cuts
 * commission, not the volume that was actually sold.
 *
 * Implemented by pushing each producer's revenue up their own chain, so a
 * broken or cyclic chain degrades locally instead of corrupting every total.
 */
export function computeGroupRevenue(
  nodes: Map<string, HierarchyNode>,
  ownRevenue: Map<string, number>,
  warnings: string[],
  maxDepth: number | null = null,
): Map<string, number> {
  const group = new Map<string, number>()
  for (const staffId of nodes.keys()) group.set(staffId, 0)
  for (const [staffId, rev] of ownRevenue) {
    group.set(staffId, round2((group.get(staffId) ?? 0) + rev))
  }

  for (const [staffId, rev] of ownRevenue) {
    if (rev === 0) continue
    let cursor = nodes.get(staffId)?.uplineStaffId ?? null
    const seen = new Set<string>([staffId])
    let depth = 0

    while (cursor) {
      if (maxDepth !== null && depth >= maxDepth) break
      if (seen.has(cursor)) {
        warnings.push(
          `Hierarchy cycle detected at staff ${cursor} — group revenue roll-up stopped for ${staffId}.`,
        )
        break
      }
      if (++depth > MAX_UPLINE_DEPTH) {
        warnings.push(
          `Upline chain deeper than ${MAX_UPLINE_DEPTH} for staff ${staffId} — group revenue truncated.`,
        )
        break
      }
      seen.add(cursor)
      group.set(cursor, round2((group.get(cursor) ?? 0) + rev))
      cursor = nodes.get(cursor)?.uplineStaffId ?? null
    }
  }

  return group
}

// ─── Rate resolution ────────────────────────────────────────────────────────

export interface ResolvedRank {
  /** The rank actually used to pay this month. */
  effective: Rank | undefined
  /**
   * The floor this month climbs from: the rank they were placed at, lifted
   * (variable mode) to the rung their EARNED title carries — see
   * `earnedFloor`.
   */
  base: Rank | undefined
  /** The one rung above the floor, when this month's figures pass its gate. */
  qualifiesFor: Rank | undefined
}

/** The figures a month's rate resolution reads, for one person. */
export interface RankFigures {
  periodMonth: string
  /** Own + entire downline, this month, deposit-cleared. */
  groupRevenue: number
  /** Own only, this month, deposit-cleared. */
  personalRevenue: number
  priorMonths: PriorMonth[]
}

/** YYYY-MM-01, `k` months before `periodMonth`. */
export function monthsBefore(periodMonth: string, k: number): string {
  const y = Number(periodMonth.slice(0, 4))
  const m = Number(periodMonth.slice(5, 7)) - 1 - k
  const d = new Date(Date.UTC(y, m, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

/**
 * Does this month pass the gate INTO `rung`? Two kinds, never both:
 *   group  — this month's group sales clear the target (300k → Team Assistant);
 *   streak — own sales clear the target this month AND in each of the
 *            `consecutiveMonths − 1` months before it, read from those months'
 *            runs. A month with no run breaks the streak: the figure is not
 *            zero, it is unknown, and unknown does not pass.
 * A rung with neither gate cannot be climbed to by volume.
 */
export function gateHolds(rung: Rank, staffId: string, f: RankFigures): boolean {
  if (rung.groupSalesThreshold !== null) {
    return f.groupRevenue + 0.005 >= rung.groupSalesThreshold
  }
  if (rung.personalSalesThreshold !== null) {
    const need = rung.personalSalesThreshold
    if (f.personalRevenue + 0.005 < need) return false
    for (let k = 1; k < (rung.consecutiveMonths ?? 1); k++) {
      const month = f.priorMonths.find(p => p.periodMonth === monthsBefore(f.periodMonth, k))
      if (!month) return false
      if ((month.personalRevenue[staffId] ?? 0) + 0.005 < need) return false
    }
    return true
  }
  return false
}

/**
 * `fixed`    — "flexible" in the user's words: whatever rank a human moved
 *              them to is what they are paid, and it holds through a month
 *              below target.
 * `variable` — "entitled to the scheme target": climbed ONE rung above the
 *              floor in a month that passes that rung's gate, back to the
 *              floor in one that does not. Never two rungs in a month (user
 *              2026-09-03, spec Q11): a 5% Specialist who sells 300k alone is
 *              still a Specialist until two months in a row of 100k have
 *              made them Senior — only then does the 300k gate to Team
 *              Assistant apply to them.
 *
 * Either way `qualifiesFor` is reported, so a fixed-rate person who has just
 * cleared a gate shows up as due a promotion instead of silently staying put.
 */
export function resolveRank(
  node: HierarchyNode,
  ranks: Rank[],
  figures: RankFigures,
): ResolvedRank {
  const ladder = [...ranks].sort((a, b) => a.sortOrder - b.sortOrder)
  const placed = ladder.find(r => r.rankKey === node.baseRankKey)
  const earned = node.rateMode === 'variable' ? earnedFloor(ladder, node.titleId) : undefined
  const base = earned && (!placed || earned.sortOrder > placed.sortOrder) ? earned : placed

  let qualifies: Rank | undefined
  if (base) {
    const next = ladder.find(r => r.sortOrder > base.sortOrder)
    if (next && gateHolds(next, node.staffId, figures)) qualifies = next
  }

  const effective = node.rateMode === 'variable' && qualifies ? qualifies : base

  return { effective, base, qualifiesFor: qualifies }
}

// ─── Override roll-up ───────────────────────────────────────────────────────

export interface OverrideCredit {
  /** Who earns the override. */
  uplineStaffId: string
  /** Whose volume produced it. */
  downlineStaffId: string
  basisAmount: number
  /** The differential, e.g. 0.01 for a 6% Specialist over a 5% one. */
  rate: number
  amount: number
}

/**
 * Walk up from every producer, crediting each ancestor the difference between
 * their rate and the highest rate already paid below them. Total paid on any
 * ringgit therefore never exceeds the top ancestor's rate, and equal rates
 * compress to zero automatically — which is exactly the brief's "reaching 6%
 * lets you override the 5%s".
 *
 *   STL 10% → TL 9% → TA 7% → RS 5%, and the RS sells 10,000
 *   RS 5% (own) · TA 2% · TL 2% · STL 1%  →  10% total
 *
 * `rateOf` supplies the EFFECTIVE rate, so a variable-rate upline who cleared
 * their target this month overrides at the higher rate. `baseByStaff` supplies
 * the PENALTY-WEIGHTED revenue, so a bill cut for bad margin cuts the upline's
 * override in the same proportion (user decision 2026-08-31).
 *
 * A base can be negative: a drop (2026-09-26) that outweighs the month's sales
 * takes the override back from the line above, as it takes the seller's own.
 */
export function computeOverrides(
  nodes: Map<string, HierarchyNode>,
  rateOf: Map<string, number>,
  baseByStaff: Map<string, number>,
  warnings: string[],
  maxDepth: number | null = null,
  suppressedUplines: ReadonlySet<string> = new Set(),
): OverrideCredit[] {
  const credits: OverrideCredit[] = []

  for (const [downlineStaffId, base] of baseByStaff) {
    if (base === 0) continue
    const self = nodes.get(downlineStaffId)
    if (!self) continue

    let paid = rateOf.get(downlineStaffId) ?? 0
    let cursor = self.uplineStaffId
    const seen = new Set<string>([downlineStaffId])
    let depth = 0

    while (cursor) {
      if (maxDepth !== null && depth >= maxDepth) break
      if (seen.has(cursor)) {
        warnings.push(
          `Hierarchy cycle detected at staff ${cursor} — override roll-up stopped for ${downlineStaffId}.`,
        )
        break
      }
      if (++depth > MAX_UPLINE_DEPTH) {
        warnings.push(
          `Upline chain deeper than ${MAX_UPLINE_DEPTH} for staff ${downlineStaffId} — override roll-up truncated.`,
        )
        break
      }
      seen.add(cursor)

      const ancestor = nodes.get(cursor)
      if (!ancestor) {
        warnings.push(
          `Staff ${downlineStaffId} points at upline ${cursor}, who has no active hierarchy row this period.`,
        )
        break
      }

      const ancestorRate = rateOf.get(ancestor.staffId) ?? 0
      const diff = ancestorRate - paid
      if (diff > 0 && !suppressedUplines.has(ancestor.staffId)) {
        credits.push({
          uplineStaffId: ancestor.staffId,
          downlineStaffId,
          basisAmount: base,
          rate: diff,
          amount: round2(base * diff),
        })
      }
      // A package replaces this leader's percentage payout. It does not pass
      // the foregone differential to another ancestor above that leader.
      paid = Math.max(paid, ancestorRate)

      cursor = ancestor.uplineStaffId
    }
  }

  return credits
}

// ─── Engine ─────────────────────────────────────────────────────────────────

interface BrandTally {
  revenue: number
  cost: number
  complete: boolean
}

interface Draft {
  staffId: string
  node: HierarchyNode | undefined
  lines: StatementLine[]
  eligibleOrders: SalesOrder[]
  productRevenue: number
  /** Σ (order product revenue × that bill's margin multiplier) — the override base. */
  penaltyWeightedRevenue: number
  excludedRevenue: number
  deferredRevenue: number
  kpiRevenue: number
  kpiQty: number
  kpiBase: number
  kpiThresholdPct: number
  marginByBrand: Map<string, BrandTally>
  /** true when some eligible order carried no brand at all. */
  missingBrand: boolean
  marginPenaltyWithheld: number
}

export function computeCommissionRun(input: EngineInput): EngineResult {
  const warnings: string[] = []
  const { scheme } = input
  const kpiIndex = scheme.enableKpi ? indexKpiItems(input.kpiItems) : EMPTY_KPI_INDEX
  // Every line's cost ÷ its own SKU's ratio, else the sub-department's.
  const costBasis = costBasisOf(scheme.costDivisor, scheme.costRatios)
  const groupIndex = indexItemGroups(scheme.itemGroups)
  const ranks = [...input.ranks].sort((a, b) => a.sortOrder - b.sortOrder)
  const rankByKey = new Map(ranks.map(r => [r.rankKey, r]))

  const nodes = new Map<string, HierarchyNode>()
  for (const n of input.hierarchy) {
    if (nodes.has(n.staffId)) {
      warnings.push(`Staff ${n.staffId} has more than one active hierarchy row — using the first.`)
      continue
    }
    if (!rankByKey.has(n.baseRankKey)) {
      warnings.push(`Staff ${n.staffId} holds rank "${n.baseRankKey}", which is not in this scheme's ladder.`)
    }
    nodes.set(n.staffId, n)
  }

  // A title below the recruiting threshold must not hold downlines. Flag rather
  // than silently paying (or silently dropping) their override.
  //
  // The TITLE decides, not the month's rank (user 2026-09-03): a Team
  // Assistant who slips back to 5% for a month keeps the team they built,
  // and a run must not stall on it. Only somebody with no title yet is judged
  // by the rank they were placed at.
  for (const n of nodes.values()) {
    if (!n.uplineStaffId) continue
    const up = nodes.get(n.uplineStaffId)
    if (!up) continue
    const upRank = rankByKey.get(up.baseRankKey)
    const byTitle = titleCanRecruit(ranks, up.titleId)
    const allowed = byTitle ?? upRank?.canRecruit ?? true
    if (!allowed) {
      const held =
        byTitle === null
          ? `rank (${upRank?.label ?? up.baseRankKey})`
          : `title (${ranks.find(r => r.titleId === up.titleId)?.titleLabel ?? up.titleId})`
      warnings.push(
        `Staff ${n.staffId} is placed under ${up.staffId}, whose ${held} is not allowed to recruit.`,
      )
    }
  }

  const openBillPct = new Map<OpenBillRank, number>(input.openBillRules.map(r => [r.rank, r.pct]))
  const tagByOrder = new Map<string, OpenBillRank>(input.openBillTags.map(t => [t.orderId, t.rank]))

  const ordersByStaff = new Map<string, SalesOrder[]>()
  for (const order of input.orders) {
    const list = ordersByStaff.get(order.staffId)
    if (list) list.push(order)
    else ordersByStaff.set(order.staffId, [order])
  }

  // Warn once per unclassified ERP item group rather than per line.
  const unknownGroups = new Set<string>()
  for (const order of input.orders) {
    for (const line of order.lines) {
      if (classifyLine(line, groupIndex) === 'unknown_group') {
        unknownGroups.add(line.itemGroup)
      }
    }
  }
  for (const g of unknownGroups) {
    warnings.push(
      `Item group "${g}" is not classified in the scheme — its revenue was treated as NOT commissionable. Classify it in Settings.`,
    )
  }

  // Everyone who either sold something or sits in the hierarchy gets a
  // statement — an upline with no personal sales still earns overrides.
  const staffIds = new Set<string>([...ordersByStaff.keys(), ...nodes.keys()])
  const drafts = new Map<string, Draft>()
  const deferred: DeferredOrder[] = []
  const penalised: PenalisedOrder[] = []
  // A Revenue Director is never ranked: their 0% is the rule, not a gap.
  const heads = new Set(input.departmentHeadIds ?? [])
  // What each head is paid here (user 2026-09-27): their title's rung sets
  // the rate of their own bills, and the Directors tab adds a fixed amount and
  // an incentive. A director with an amount to be paid gets a statement even
  // in a month they sold nothing.
  const directorTerms = new Map((input.directors ?? []).map(d => [d.staffId, d]))
  for (const terms of directorTerms.values()) {
    heads.add(terms.staffId)
    if (terms.fixedAmount > 0 || terms.incentiveAmount > 0) staffIds.add(terms.staffId)
  }
  const directorRung = (staffId: string) => {
    const key = directorTerms.get(staffId)?.rankKey
    return key ? rankByKey.get(key) : undefined
  }

  // ── Pass A: deposit gate + own revenue ─────────────────────────────────
  for (const staffId of staffIds) {
    const node = nodes.get(staffId)
    const orders = ordersByStaff.get(staffId) ?? []

    if (!node && orders.length > 0 && !heads.has(staffId)) {
      warnings.push(
        `Staff ${staffId} has sales this period but no rank / hierarchy row — commission computed at 0%.`,
      )
    }

    const eligibleOrders: SalesOrder[] = []
    let productRevenue = 0
    let excludedRevenue = 0
    let deferredRevenue = 0

    for (const order of orders) {
      // An earlier applied run already paid this one; never pay it twice.
      if (order.alreadyReleased) continue

      const opr = orderProductRevenue(order, kpiIndex, groupIndex)

      // An upsale is recorded once the customer has paid for it; the deposit
      // gate is a question about ERP bills.
      if (!order.upsale && !isDepositMet(order, scheme.depositThresholdPct)) {
        deferredRevenue = round2(deferredRevenue + opr)
        deferred.push({
          staffId,
          orderId: order.id,
          orderNo: order.orderNo,
          orderDate: order.orderDate,
          orderTotal: order.orderTotal,
          paidAmount: order.paidAmount,
          requiredAmount: depositRequired(order.orderTotal, scheme.depositThresholdPct),
          productRevenue: opr,
        })
        continue
      }

      eligibleOrders.push(order)
      productRevenue = round2(productRevenue + opr)
      for (const line of order.lines) {
        const cls = classifyLine(line, groupIndex)
        if (cls === 'excluded_group' || cls === 'unknown_group') {
          excludedRevenue = round2(excludedRevenue + line.lineAmount)
        }
      }
    }

    drafts.set(staffId, {
      staffId,
      node,
      lines: [],
      eligibleOrders,
      productRevenue,
      penaltyWeightedRevenue: 0,
      excludedRevenue,
      deferredRevenue,
      kpiRevenue: 0,
      kpiQty: 0,
      kpiBase: 0,
      kpiThresholdPct: 0,
      marginByBrand: new Map(),
      missingBrand: false,
      marginPenaltyWithheld: 0,
    })
  }

  // ── Pass B: group revenue ──────────────────────────────────────────────
  const ownRevenue = new Map([...drafts.values()].map(d => [d.staffId, d.productRevenue]))
  const groupRevenue = computeGroupRevenue(nodes, ownRevenue, warnings, scheme.groupSalesDepth ?? null)

  // ── Pass C: effective rate ─────────────────────────────────────────────
  const resolved = new Map<string, ResolvedRank>()
  const rateOf = new Map<string, number>()
  const overrideRateOf = new Map<string, number>()
  const packageRecipients = new Set<string>()
  const groupResults = new Map<string, IrGroupsResult>()
  const packageRanks = ranks.filter(r => (r.groupIncentiveAmount ?? 0) > 0)
  const percentageRanks = ranks.filter(r => (r.groupIncentiveAmount ?? 0) === 0)
  if (scheme.enableGroupIncentive && packageRanks.length === 0) {
    warnings.push('Group incentives are switched on but no package rung is configured. Add its incentive and monthly group target before applying this run.')
  }
  if (scheme.enableGroupIncentive && (scheme.groupSalesDepth !== 2 || scheme.overrideDepth !== 2)) {
    warnings.push('Group packages require two sales layers and two override layers. Correct the scheme before applying this run.')
  }
  if (scheme.enableGroupIncentive && packageRanks.length > 1) {
    warnings.push('Only one group-incentive rung may be active on a scheme ladder. Remove the ambiguous package before applying this run.')
  }
  if (!scheme.enableGroupIncentive && nodes.size > 0 &&
      [...nodes.values()].some(n => packageRanks.some(r => r.rankKey === n.baseRankKey))) {
    warnings.push('A member holds a group-incentive rank but group incentives are switched off. Enable the scheme component before applying this run.')
  }
  for (const staffId of staffIds) {
    // A director: their title's rung is the rate, and nothing climbs it — it
    // carries no gate, so no month of volume moves them anywhere.
    if (heads.has(staffId)) {
      const rung = directorRung(staffId)
      resolved.set(staffId, { effective: rung, base: rung, qualifiesFor: undefined })
      rateOf.set(staffId, rung?.productRate ?? 0)
      continue
    }
    const node = nodes.get(staffId)
    if (!node) {
      rateOf.set(staffId, 0)
      continue
    }
    const figures = {
      periodMonth: input.periodMonth,
      groupRevenue: groupRevenue.get(staffId) ?? 0,
      personalRevenue: ownRevenue.get(staffId) ?? 0,
      priorMonths: input.priorMonths,
    }
    const placedPackage = packageRanks.find(r => r.rankKey === node.baseRankKey)
    const heldPackage = packageRanks.find(r => r.titleId === node.titleId)
    const packageFloor = placedPackage ?? heldPackage
    const fallback = packageFloor
      ? [...percentageRanks].reverse().find(r => r.sortOrder < packageFloor.sortOrder)
      : undefined
    // Holding the STL title/rank cannot lock a package into future months.
    // A month with no qualifying group pays the configured TL percentage.
    const percentageNode = packageFloor && fallback
      ? { ...node, baseRankKey: fallback.rankKey }
      : node
    // A package is never an ordinary group-revenue rung, including while
    // its component is off. Only independent qualifying lines activate it.
    let r = resolveRank(percentageNode, percentageRanks, figures)
    let comparisonRate = r.effective?.productRate ?? 0

    if (scheme.enableGroupIncentive && packageRanks.length <= 1) {
      if (packageFloor && !fallback) {
        warnings.push(`Staff ${staffId}'s group-incentive rank has no percentage rank below it for a month below target.`)
      }
      const mayLead = titleCanRecruit(ranks, node.titleId) ?? rankByKey.get(node.baseRankKey)?.canRecruit ?? false
      if (mayLead) {
        for (const candidate of packageRanks) {
          if (candidate.groupSalesThreshold === null || candidate.groupSalesThreshold <= 0) {
            warnings.push(`${candidate.label} needs a positive per-group sales target before group incentives can be computed.`)
            continue
          }
          const groups = computeIrGroups({
            leaderStaffId: staffId,
            hierarchy: [...nodes.values()],
            personalRevenue: ownRevenue,
            groupSalesThreshold: candidate.groupSalesThreshold,
            incentivePerGroup: candidate.groupIncentiveAmount ?? 0,
            subsidyPerGroup: candidate.groupSubsidyCap ?? 0,
          })
          warnings.push(...groups.warnings)
          // Keep missed targets visible too, so the fallback is explainable.
          if (!groupResults.has(staffId) || groups.qualifyingGroupCount > 0) groupResults.set(staffId, groups)
          if (groups.qualifyingGroupCount === 0) continue
          const qualifiesFor = candidate
          if (node.rateMode === 'variable' || placedPackage) {
            r = { ...r, effective: candidate, qualifiesFor }
            packageRecipients.add(staffId)
            comparisonRate = [...percentageRanks].reverse().find(p => p.sortOrder < candidate.sortOrder)?.productRate ?? comparisonRate
          } else {
            r = { ...r, qualifiesFor }
          }
        }
      }
    }
    resolved.set(staffId, r)
    rateOf.set(staffId, packageRecipients.has(staffId) ? 0 : r.effective?.productRate ?? 0)
    overrideRateOf.set(staffId, comparisonRate)
  }

  // ── Pass D: C1 / C2 / C3, each bill scaled by its margin penalty ───────
  let ordersWithoutCost = 0

  for (const draft of drafts.values()) {
    // A department head's own bills pay the rate of their title's rung and
    // NOTHING else — no KPI allowance, Open Bill bonus, margin penalty or
    // incentive (user 2026-09-27: 如果自己有做 sales，就只拿自己的 rate 罢了).
    // Without a rung, no rate: their sales still stand on the statement and
    // the bills still close with the month.
    if (heads.has(draft.staffId)) {
      const headRate = rateOf.get(draft.staffId) ?? 0
      if (!scheme.enableProductRevenue || headRate <= 0) continue
      for (const order of draft.eligibleOrders) {
        const opr = orderRevenueSplit(order, kpiIndex, groupIndex).main
        if (opr === 0) continue
        const carried = order.periodMonth !== input.periodMonth
        draft.penaltyWeightedRevenue = round2(draft.penaltyWeightedRevenue + opr)
        draft.lines.push({
          component: 'product_revenue',
          sourceOrderId: order.id,
          basisAmount: opr,
          rate: headRate,
          qty: null,
          amount: round2(opr * headRate),
          note: `${order.orderNo} · ${order.orderDate}${carried ? ` · carried from ${order.periodMonth.slice(0, 7)}` : ''} · director's own bill`,
        })
      }
      continue
    }
    const rate = rateOf.get(draft.staffId) ?? 0

    for (const order of draft.eligibleOrders) {
      const split = orderRevenueSplit(order, kpiIndex, groupIndex)
      const opr = split.main
      const carried = order.periodMonth !== input.periodMonth
      const carriedNote = carried ? ` · carried from ${order.periodMonth.slice(0, 7)}` : ''

      // A sales order never crosses brands (user 2026-08-31); if one does, the
      // import has a problem and the margin ladder becomes ambiguous. The
      // brand only chooses a margin ladder, so a month that pays no margin
      // has nothing to ask about it (2026-09-27).
      const base = marginBase(order.lines, kpiIndex, groupIndex, costBasis, order.brandCode ?? null)
      if (base.mixedBrand && (scheme.enableMarginPenalty || scheme.enableMarginIncentive)) {
        warnings.push(
          `Order ${order.orderNo} carries lines from more than one brand, which should not happen — the dominant brand's margin ladder was used.`,
        )
      }
      const bill = billMargin(order, base)

      if (base.revenue > 0) {
        if (base.brandCode === null) draft.missingBrand = true
        else {
          const tally = draft.marginByBrand.get(base.brandCode) ?? { revenue: 0, cost: 0, complete: true }
          tally.revenue = round2(tally.revenue + base.revenue)
          tally.cost = round2(tally.cost + bill.cost)
          if (bill.source === 'none') tally.complete = false
          draft.marginByBrand.set(base.brandCode, tally)
        }
      }

      let multiplier = 1
      let penaltyBand: MarginBand | null = null
      if (scheme.enableMarginPenalty) {
        if (bill.pct === null) {
          if (base.revenue > 0) ordersWithoutCost++
        } else {
          penaltyBand = penaltyBandFor(bill.pct, base.brandCode, input.marginBands)
          if (penaltyBand) multiplier = penaltyBand.commissionMultiplier
        }
      }
      draft.penaltyWeightedRevenue = round2(draft.penaltyWeightedRevenue + opr * multiplier)

      const penaltyNote = penaltyBand
        ? ` · ${penaltyBand.label} (${round2(bill.pct! * 100)}% margin${bill.source === 'manual' ? ', keyed in' : ''}) × ${multiplier}`
        : ''
      let withheldOnThisBill = 0

      // C1 — one line per order, so the drill-down reads like a ledger.
      if (scheme.enableProductRevenue && opr !== 0 && rate > 0) {
        const full = round2(opr * rate)
        const paid = round2(full * multiplier)
        withheldOnThisBill = round2(withheldOnThisBill + (full - paid))
        draft.lines.push({
          component: 'product_revenue',
          sourceOrderId: order.id,
          basisAmount: opr,
          rate,
          qty: null,
          amount: paid,
          note: `${order.orderNo} · ${order.orderDate}${carriedNote}${penaltyNote}`,
        })
      }

      // C2 — one line per KPI item the bill carries: its amount came off the
      // main sales above and is paid here, flat. The allowance is for moving
      // the item and is NOT margin-scaled (user 2026-09-27).
      for (const hit of split.kpiHits) {
        draft.kpiRevenue = round2(draft.kpiRevenue + hit.amount)
        draft.kpiQty += hit.qty
        draft.kpiBase = round2(draft.kpiBase + hit.amount)
        draft.lines.push({
          component: 'kpi_item',
          sourceOrderId: order.id,
          sourceLineId: hit.lineId,
          basisAmount: hit.amount,
          rate: null,
          qty: hit.qty,
          amount: hit.amount,
          note: `${order.orderNo} · ${kpiItemLabel(hit.item)} × ${hit.qty} @ ${hit.item.kpiAmount}`,
        })
      }

      // C3 — Open Bill: the 1st / 2nd / 3rd bill written on an event day.
      if (scheme.enableOpenBill) {
        // An upsale is not a bill written on the day, so it holds no rank.
        const rank = order.upsale ? undefined : tagByOrder.get(order.id)
        const pct = rank === undefined ? undefined : openBillPct.get(rank)
        if (rank !== undefined && pct === undefined) {
          warnings.push(
            `Order ${order.orderNo} is tagged Open Bill ${rank}, but no bonus rate is configured for that rank.`,
          )
        } else if (rank !== undefined && pct !== undefined) {
          const full =
            scheme.openBillBasis === 'pct_of_revenue'
              ? round2(opr * pct)
              : round2(opr * rate * pct)
          const paid = round2(full * multiplier)
          withheldOnThisBill = round2(withheldOnThisBill + (full - paid))
          if (paid !== 0) {
            draft.lines.push({
              component: 'open_bill',
              sourceOrderId: order.id,
              basisAmount: opr,
              rate: pct,
              qty: null,
              amount: paid,
              note:
                `${ordinal(rank)} bill · ${order.eventDate} · ${order.orderNo}` +
                (scheme.openBillBasis === 'pct_of_revenue'
                  ? ` · ${round2(pct * 100)}% of revenue`
                  : ` · +${round2(pct * 100)}% on ${round2(rate * 100)}% commission`) +
                penaltyNote,
            })
          }
        }
      }

      if (penaltyBand) {
        draft.marginPenaltyWithheld = round2(draft.marginPenaltyWithheld + withheldOnThisBill)
        penalised.push({
          staffId: draft.staffId,
          orderId: order.id,
          orderNo: order.orderNo,
          brandCode: base.brandCode,
          marginPct: bill.pct!,
          marginSource: bill.source,
          bandKey: penaltyBand.bandKey,
          bandLabel: penaltyBand.label,
          multiplier,
          withheld: withheldOnThisBill,
        })
      }
    }

    // C2 threshold uplift — a single line on the whole KPI base.
    draft.kpiThresholdPct = kpiThresholdPct(draft.kpiQty, input.kpiThresholds)
    if (draft.kpiThresholdPct > 0 && draft.kpiBase > 0) {
      draft.lines.push({
        component: 'kpi_threshold',
        basisAmount: draft.kpiBase,
        rate: draft.kpiThresholdPct,
        qty: draft.kpiQty,
        amount: round2(draft.kpiBase * draft.kpiThresholdPct),
        note: `${draft.kpiQty} KPI items → +${round2(draft.kpiThresholdPct * 100)}% on ${draft.kpiBase.toFixed(2)}`,
      })
    }
  }

  if (ordersWithoutCost > 0) {
    warnings.push(
      `${ordersWithoutCost} order(s) have no margin: neither a unit cost on every line (Settings → Product List) nor a margin keyed in on the order. The below-margin penalty was skipped for them.`,
    )
  }

  // ── Pass E: overrides, on the PENALTY-WEIGHTED revenue ─────────────────
  if (scheme.enableOverride) {
    const baseByStaff = new Map<string, number>()
    for (const d of drafts.values()) {
      baseByStaff.set(
        d.staffId,
        scheme.overrideIncludesKpi
          ? round2(d.penaltyWeightedRevenue + d.kpiRevenue)
          : d.penaltyWeightedRevenue,
      )
    }

    for (const credit of computeOverrides(nodes, overrideRateOf, baseByStaff, warnings, scheme.overrideDepth ?? null, packageRecipients)) {
      const draft = drafts.get(credit.uplineStaffId)
      if (!draft || credit.amount === 0) continue
      draft.lines.push({
        component: 'override',
        sourceStaffId: credit.downlineStaffId,
        basisAmount: credit.basisAmount,
        rate: credit.rate,
        qty: null,
        amount: credit.amount,
        note: `Override on downline ${credit.downlineStaffId} · ${round2(credit.rate * 100)}% differential`,
      })
    }
  }

  // Fixed package: each independent direct-line group earns once, however
  // far it exceeds target. Subsidy remains a memo for Claims, not a cash line.
  for (const staffId of packageRecipients) {
    const draft = drafts.get(staffId)
    const groups = groupResults.get(staffId)
    if (!draft || !groups) continue
    for (const group of groups.groups) {
      if (!group.qualifies) continue
      draft.lines.push({
        component: 'group_incentive',
        sourceStaffId: group.directStaffId,
        basisAmount: group.totalRevenue,
        rate: null,
        qty: 1,
        amount: group.incentive,
        note: `Qualifying direct-line group ${group.directStaffId} · own ${group.leaderPersonalRevenue.toFixed(2)} + direct ${group.directPersonalRevenue.toFixed(2)} + second layer ${group.secondLayerRevenue.toFixed(2)}. Own sales count in each direct group; subsidy is separate.`,
      })
    }
  }

  // ── Directors: the fixed amount and the threshold incentive ───────────
  // Per director and sub-department (Rules › Directors, 2026-09-27). The
  // incentive reads the month's Commissionable value — Comm Cal's card.
  for (const terms of directorTerms.values()) {
    const draft = drafts.get(terms.staffId)
    if (!draft) continue
    if (terms.fixedAmount > 0) {
      draft.lines.push({
        component: 'director_fixed',
        basisAmount: round2(terms.fixedAmount),
        rate: null,
        qty: null,
        amount: round2(terms.fixedAmount),
        note: 'Fixed amount · Rules › Directors',
      })
    }
    if (terms.incentiveAmount > 0 && terms.salesThreshold !== null && terms.salesThreshold > 0) {
      const monthValue = input.monthCommissionableValue
      if (monthValue === undefined) {
        warnings.push(`Staff ${terms.staffId}'s director incentive could not be judged — the month's Commissionable value was not read.`)
      } else if (directorIncentiveEarned(terms, monthValue)) {
        draft.lines.push({
          component: 'director_incentive',
          basisAmount: monthValue,
          rate: null,
          qty: null,
          amount: round2(terms.incentiveAmount),
          note: `Commissionable value ${monthValue.toFixed(2)} reached ${terms.salesThreshold.toFixed(2)}`,
        })
      }
    }
  }

  // ── Pass F: monthly margin incentive, every brand must clear ───────────
  const marginSummary = new Map<
    string,
    { brands: BrandMargin[]; overall: number | null; bandKey: string | null }
  >()
  const incentiveBlocked = new Map<string, string>()

  for (const d of drafts.values()) {
    const brands: BrandMargin[] = [...d.marginByBrand.entries()].map(([brandCode, t]) => ({
      brandCode,
      revenue: t.revenue,
      cost: t.cost,
      marginPct: marginPctOf(t),
    }))
    if (d.missingBrand) {
      brands.push({ brandCode: null, revenue: 0, cost: 0, marginPct: null })
    }

    const totalRevenue = sum(brands.map(b => b.revenue))
    const totalCost = sum(brands.map(b => b.cost))
    const overall = marginPctOf({
      revenue: totalRevenue,
      cost: totalCost,
      complete: brands.every(b => b.marginPct !== null),
    })

    let bandKey: string | null = null
    if (scheme.enableMarginIncentive && brands.length > 0) {
      const inc = marginIncentiveAcrossBrands(brands, input.marginBands)
      bandKey = inc.bandKey
      if (inc.blockedReason) incentiveBlocked.set(d.staffId, inc.blockedReason)
      if (inc.amount > 0) {
        d.lines.push({
          component: 'margin_incentive',
          basisAmount: totalRevenue,
          rate: overall,
          qty: null,
          amount: inc.amount,
          note:
            `${inc.bandLabel} · cleared by every brand · ` +
            brands
              .map(b => `${b.brandCode} ${b.marginPct === null ? '?' : round2(b.marginPct * 100) + '%'}`)
              .join(', '),
        })
      }
    }

    marginSummary.set(d.staffId, { brands, overall, bandKey })
  }

  for (const [staffId, reason] of incentiveBlocked) {
    warnings.push(`Margin incentive skipped for staff ${staffId} — ${reason}.`)
  }

  // ── Assemble ───────────────────────────────────────────────────────────
  const statements: Statement[] = []
  for (const d of drafts.values()) {
    const by = (c: CommissionComponent) =>
      sum(d.lines.filter(l => l.component === c).map(l => l.amount))

    const productCommission = by('product_revenue')
    const kpiCommission = round2(by('kpi_item') + by('kpi_threshold'))
    const openBillBonus = by('open_bill')
    const overrideCommission = by('override')
    const marginIncentive = by('margin_incentive')
    const groupIncentive = by('group_incentive')
    const directorFixed = by('director_fixed')
    const directorIncentive = by('director_incentive')
    const totalCommission = round2(
      productCommission + kpiCommission + openBillBonus + overrideCommission + marginIncentive + groupIncentive
        + directorFixed + directorIncentive,
    )

    const rank = resolved.get(d.staffId)
    const margin = marginSummary.get(d.staffId)

    // Only a drop can take a month below zero, and payroll cannot pay a
    // negative commission (hr_monthly_payroll.amounts_non_negative): say so
    // here, where the apply refuses it in words, not as a constraint.
    if (totalCommission < 0) {
      const drops = d.eligibleOrders.filter(o => o.upsale && o.orderTotal < 0).map(o => o.orderNo)
      warnings.push(
        `Staff ${d.staffId}'s commission comes to ${totalCommission.toFixed(2)} this month — drops take back more ` +
          `than the month pays${drops.length > 0 ? ` (${drops.join(', ')})` : ''}. Payroll cannot pay a negative ` +
          'commission: pay the drop in a month their sales cover it.',
      )
    }

    // Someone with no orders, no downline volume, nothing deferred and no
    // rank contributes nothing — don't clutter the run with empty statements.
    if (
      totalCommission === 0 &&
      d.lines.length === 0 &&
      d.productRevenue === 0 &&
      d.deferredRevenue === 0 &&
      (groupRevenue.get(d.staffId) ?? 0) === 0
    ) {
      continue
    }

    statements.push({
      staffId: d.staffId,
      // The floor the month climbed from — the placed rank, or the rung an
      // earned title lifted it to.
      baseRankKey: rank?.base?.rankKey ?? d.node?.baseRankKey ?? null,
      rateMode: d.node?.rateMode ?? scheme.defaultRateMode,
      effectiveRankKey: rank?.effective?.rankKey ?? null,
      rankTitleId: rank?.effective?.titleId ?? null,
      // The ratchet, previewed: null unless this month's rank sits under a
      // title above the one they hold. The RPC decides again at apply time.
      // A director's rung is their own; it never raises a title.
      promotesToTitleId: heads.has(d.staffId) ? null : promotesTo(ranks, d.node?.titleId ?? null, rank?.effective?.titleId ?? null),
      productRate: rateOf.get(d.staffId) ?? 0,
      qualifiesForRankKey: rank?.qualifiesFor?.rankKey ?? null,
      uplineStaffId: d.node?.uplineStaffId ?? null,
      productRevenue: d.productRevenue,
      penaltyWeightedRevenue: d.penaltyWeightedRevenue,
      groupRevenue: groupRevenue.get(d.staffId) ?? d.productRevenue,
      excludedRevenue: d.excludedRevenue,
      deferredRevenue: d.deferredRevenue,
      productCommission,
      kpiQty: d.kpiQty,
      kpiBase: d.kpiBase,
      kpiThresholdPct: d.kpiThresholdPct,
      kpiCommission,
      openBillBonus,
      overrideCommission,
      marginRevenue: sum((margin?.brands ?? []).map(b => b.revenue)),
      marginCost: sum((margin?.brands ?? []).map(b => b.cost)),
      marginPct: margin?.overall ?? null,
      marginByBrand: margin?.brands ?? [],
      marginBandKey: margin?.bandKey ?? null,
      marginIncentive,
      groupIncentive,
      groupSubsidyCap: packageRecipients.has(d.staffId) ? groupResults.get(d.staffId)?.subsidyCap ?? 0 : 0,
      groupBreakdown: groupResults.get(d.staffId)?.groups ?? [],
      fullSpec: groupResults.get(d.staffId)?.fullSpec ?? false,
      marginPenaltyWithheld: d.marginPenaltyWithheld,
      ...(directorTerms.has(d.staffId) ? { directorFixed, directorIncentive } : {}),
      totalCommission,
      lines: d.lines,
    })
  }

  statements.sort((a, b) => b.totalCommission - a.totalCommission)

  return {
    periodMonth: input.periodMonth,
    statements,
    totalCommission: sum(statements.map(s => s.totalCommission)),
    deferred,
    penalised,
    warnings,
  }
}

function ordinal(n: OpenBillRank): string {
  return n === 1 ? '1st' : n === 2 ? '2nd' : '3rd'
}
