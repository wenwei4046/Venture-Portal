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
 *   E  C4 override, using the effective rates from C
 *   F  the monthly MARGIN INCENTIVE
 *
 * Rounding rule: every statement LINE is rounded to 2dp, and every subtotal is
 * the sum of its rounded lines. That makes `Σ lines === total` exact, which is
 * the invariant the drill-down page and the apply RPC both rely on.
 *
 * See docs/module-spec-revenue-commission.md §4.
 */

import type {
  CommissionComponent,
  DeferredOrder,
  EngineInput,
  EngineResult,
  HierarchyNode,
  ItemGroupRule,
  KpiItem,
  KpiThreshold,
  MarginBand,
  OpenBillRank,
  PenalisedOrder,
  Rank,
  SalesLine,
  SalesOrder,
  Statement,
  StatementLine,
} from './types'

export * from './types'

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

/**
 * Index KPI items by product code. Codes are compared case-insensitively and
 * trimmed — ERP exports pad and vary case between reports.
 */
export function indexKpiItems(items: KpiItem[]): Map<string, number> {
  return new Map(items.map(i => [normaliseCode(i.productCode), i.kpiAmount]))
}

export function indexItemGroups(rules: ItemGroupRule[]): Map<string, boolean> {
  return new Map(rules.map(r => [normaliseCode(r.group), r.commissionable]))
}

/**
 * A line is a KPI line when its product code is a configured KPI item.
 * KPI lines pay a flat allowance and their revenue is excluded from the
 * product-revenue base — otherwise the same sale would be paid twice.
 */
export function isKpiLine(productCode: string, kpiIndex: Map<string, number>): boolean {
  return kpiIndex.has(normaliseCode(productCode))
}

export type LineClass = 'kpi' | 'commissionable' | 'excluded_group' | 'unknown_group'

export function classifyLine(
  line: SalesLine,
  kpiIndex: Map<string, number>,
  groupIndex: Map<string, boolean>,
): LineClass {
  if (isKpiLine(line.productCode, kpiIndex)) return 'kpi'
  const known = groupIndex.get(normaliseCode(line.itemGroup))
  if (known === undefined) return 'unknown_group'
  return known ? 'commissionable' : 'excluded_group'
}

/** True for any line whose item group earns commission — KPI lines included. */
function inGoodsScope(
  line: SalesLine,
  kpiIndex: Map<string, number>,
  groupIndex: Map<string, boolean>,
): boolean {
  const cls = classifyLine(line, kpiIndex, groupIndex)
  if (cls === 'commissionable') return true
  // A KPI line is a giveaway from a commissionable group; it belongs to the
  // margin base (its cost is real) even though its revenue is usually 0.
  return cls === 'kpi' && groupIndex.get(normaliseCode(line.itemGroup)) === true
}

/** Product revenue of one order: commissionable, non-KPI lines only. */
export function orderProductRevenue(
  order: SalesOrder,
  kpiIndex: Map<string, number>,
  groupIndex: Map<string, boolean>,
): number {
  return sum(
    order.lines
      .filter(l => classifyLine(l, kpiIndex, groupIndex) === 'commissionable')
      .map(l => l.lineAmount),
  )
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
  /** Brand with the largest revenue in scope. */
  brandCode: string | null
}

/**
 * Margin base of a set of lines: revenue and cost of the GOODS only.
 *
 * Transport and disposal are excluded — they are pass-through service charges
 * and are not commissionable either. Free bundled KPI items ARE included: a
 * giveaway pillow has real cost and no revenue, which is exactly how giving
 * them away is supposed to hurt the margin.
 */
export function marginBase(
  lines: SalesLine[],
  kpiIndex: Map<string, number>,
  groupIndex: Map<string, boolean>,
): MarginBase {
  let revenue = 0
  let cost = 0
  let complete = true
  const byBrand = new Map<string, number>()

  for (const line of lines) {
    if (!inGoodsScope(line, kpiIndex, groupIndex)) continue
    revenue = round2(revenue + line.lineAmount)
    if (line.costAmount === undefined || line.costAmount === null) complete = false
    else cost = round2(cost + line.costAmount)
    if (line.brandCode) {
      byBrand.set(line.brandCode, round2((byBrand.get(line.brandCode) ?? 0) + line.lineAmount))
    }
  }

  let brandCode: string | null = null
  let best = -Infinity
  for (const [brand, rev] of byBrand) {
    if (rev > best) {
      best = rev
      brandCode = brand
    }
  }

  return { revenue, cost, complete, brandCode }
}

/** (revenue − cost) / revenue, or null when it cannot be known. */
export function marginPctOf(base: MarginBase): number | null {
  if (!base.complete) return null
  if (base.revenue <= 0) return null
  return (base.revenue - base.cost) / base.revenue
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
}

/**
 * Monthly margin incentive. Incentive bands are read as "margin at or ABOVE
 * this threshold" and STACK: clearing Tier 1 (36%) pays RM1,000, and also
 * clearing Tier 2 (43%) pays a further RM1,500 for RM2,500 in total (user
 * brief 2026-08-31). The reported band is the highest one reached.
 */
export function marginIncentiveFor(
  marginPct: number,
  brandCode: string | null,
  bands: MarginBand[],
): IncentiveResult {
  let amount = 0
  let top: MarginBand | null = null
  for (const b of bands) {
    if (b.kind !== 'incentive') continue
    if (brandCode !== null && b.brandCode !== brandCode) continue
    if (marginPct + 1e-9 < b.marginPct) continue
    amount = round2(amount + b.monthlyIncentive)
    if (!top || b.marginPct > top.marginPct) top = b
  }
  return { amount, bandKey: top?.bandKey ?? null, bandLabel: top?.label ?? null }
}

// ─── Group revenue ──────────────────────────────────────────────────────────

/**
 * Own commissionable revenue plus the entire downline subtree's — what the
 * promotion threshold measures. The brief's example: a Revenue Specialist with
 * 200k of their own and two downlines on 100k each has group sales of 400k,
 * which clears the 300k gate for Team Assistant.
 *
 * Implemented by pushing each producer's revenue up their own chain, so a
 * broken or cyclic chain degrades locally instead of corrupting every total.
 */
export function computeGroupRevenue(
  nodes: Map<string, HierarchyNode>,
  ownRevenue: Map<string, number>,
  warnings: string[],
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
  /** What they have attained — the floor. */
  base: Rank | undefined
  /** Highest threshold rank their group sales clear, when above the base. */
  qualifiesFor: Rank | undefined
}

/**
 * `fixed`    — "flexible" in the user's words: whatever title a human moved
 *              them to is their title, and it holds through a month below
 *              target.
 * `variable` — "entitled to the scheme target": the highest rank whose
 *              group-sales threshold this month's figures clear, never below
 *              the attained rank. Miss the target and it drops back.
 *
 * Either way `qualifiesFor` is reported, so a fixed-rate person who has just
 * cleared 300k shows up as due a promotion instead of silently staying put.
 */
export function resolveRank(
  node: HierarchyNode,
  ranks: Rank[],
  groupRevenue: number,
): ResolvedRank {
  const byKey = new Map(ranks.map(r => [r.rankKey, r]))
  const base = byKey.get(node.baseRankKey)

  let qualifies: Rank | undefined
  for (const r of ranks) {
    if (r.groupSalesThreshold === null) continue
    if (groupRevenue + 0.005 < r.groupSalesThreshold) continue
    if (base && r.sortOrder <= base.sortOrder) continue
    if (!qualifies || r.sortOrder > qualifies.sortOrder) qualifies = r
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
 * their target this month overrides at the higher rate.
 */
export function computeOverrides(
  nodes: Map<string, HierarchyNode>,
  rateOf: Map<string, number>,
  baseByStaff: Map<string, number>,
  warnings: string[],
): OverrideCredit[] {
  const credits: OverrideCredit[] = []

  for (const [downlineStaffId, base] of baseByStaff) {
    if (base <= 0) continue
    const self = nodes.get(downlineStaffId)
    if (!self) continue

    let paid = rateOf.get(downlineStaffId) ?? 0
    let cursor = self.uplineStaffId
    const seen = new Set<string>([downlineStaffId])
    let depth = 0

    while (cursor) {
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
      if (diff > 0) {
        credits.push({
          uplineStaffId: ancestor.staffId,
          downlineStaffId,
          basisAmount: base,
          rate: diff,
          amount: round2(base * diff),
        })
        paid = ancestorRate
      }

      cursor = ancestor.uplineStaffId
    }
  }

  return credits
}

// ─── Engine ─────────────────────────────────────────────────────────────────

interface Draft {
  staffId: string
  node: HierarchyNode | undefined
  lines: StatementLine[]
  eligibleOrders: SalesOrder[]
  productRevenue: number
  excludedRevenue: number
  deferredRevenue: number
  kpiRevenue: number
  kpiQty: number
  kpiBase: number
  kpiThresholdPct: number
  marginRevenue: number
  marginCost: number
  marginComplete: boolean
  marginBrandRevenue: Map<string, number>
  marginPenaltyWithheld: number
}

export function computeCommissionRun(input: EngineInput): EngineResult {
  const warnings: string[] = []
  const { scheme } = input
  const kpiIndex = scheme.enableKpi ? indexKpiItems(input.kpiItems) : new Map<string, number>()
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

  // A rank below the recruiting threshold must not hold downlines. Flag rather
  // than silently paying (or silently dropping) their override.
  for (const n of nodes.values()) {
    if (!n.uplineStaffId) continue
    const up = nodes.get(n.uplineStaffId)
    const upRank = up && rankByKey.get(up.baseRankKey)
    if (upRank && !upRank.canRecruit) {
      warnings.push(
        `Staff ${n.staffId} is placed under ${up!.staffId}, whose rank (${upRank.label}) is not allowed to recruit.`,
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
      if (classifyLine(line, kpiIndex, groupIndex) === 'unknown_group') {
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

  // ── Pass A: deposit gate + own revenue ─────────────────────────────────
  for (const staffId of staffIds) {
    const node = nodes.get(staffId)
    const orders = ordersByStaff.get(staffId) ?? []

    if (!node && orders.length > 0) {
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

      if (!isDepositMet(order, scheme.depositThresholdPct)) {
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
        const cls = classifyLine(line, kpiIndex, groupIndex)
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
      excludedRevenue,
      deferredRevenue,
      kpiRevenue: 0,
      kpiQty: 0,
      kpiBase: 0,
      kpiThresholdPct: 0,
      marginRevenue: 0,
      marginCost: 0,
      marginComplete: true,
      marginBrandRevenue: new Map(),
      marginPenaltyWithheld: 0,
    })
  }

  // ── Pass B: group revenue ──────────────────────────────────────────────
  const ownRevenue = new Map([...drafts.values()].map(d => [d.staffId, d.productRevenue]))
  const groupRevenue = computeGroupRevenue(nodes, ownRevenue, warnings)

  // ── Pass C: effective rate ─────────────────────────────────────────────
  const resolved = new Map<string, ResolvedRank>()
  const rateOf = new Map<string, number>()
  for (const staffId of staffIds) {
    const node = nodes.get(staffId)
    if (!node) {
      rateOf.set(staffId, 0)
      continue
    }
    const r = resolveRank(node, ranks, groupRevenue.get(staffId) ?? 0)
    resolved.set(staffId, r)
    rateOf.set(staffId, r.effective?.productRate ?? 0)
  }

  // ── Pass D: C1 / C2 / C3, each bill scaled by its margin penalty ───────
  let ordersWithoutCost = 0

  for (const draft of drafts.values()) {
    const rate = rateOf.get(draft.staffId) ?? 0

    for (const order of draft.eligibleOrders) {
      const opr = orderProductRevenue(order, kpiIndex, groupIndex)
      const carried = order.periodMonth !== input.periodMonth
      const carriedNote = carried ? ` · carried from ${order.periodMonth.slice(0, 7)}` : ''

      // This bill's margin decides whether its commission is cut.
      const base = marginBase(order.lines, kpiIndex, groupIndex)
      draft.marginRevenue = round2(draft.marginRevenue + base.revenue)
      draft.marginCost = round2(draft.marginCost + base.cost)
      if (!base.complete) draft.marginComplete = false
      if (base.brandCode) {
        draft.marginBrandRevenue.set(
          base.brandCode,
          round2((draft.marginBrandRevenue.get(base.brandCode) ?? 0) + base.revenue),
        )
      }

      const billMargin = marginPctOf(base)
      let multiplier = 1
      let penaltyBand: MarginBand | null = null
      if (scheme.enableMarginPenalty) {
        if (billMargin === null) {
          if (base.revenue > 0) ordersWithoutCost++
        } else {
          penaltyBand = penaltyBandFor(billMargin, base.brandCode, input.marginBands)
          if (penaltyBand) multiplier = penaltyBand.commissionMultiplier
        }
      }
      const penaltyNote = penaltyBand
        ? ` · ${penaltyBand.label} (${round2(billMargin! * 100)}% margin) × ${multiplier}`
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

      // C2 inputs — one line per KPI line item. The flat allowance is for
      // moving the item and is NOT margin-scaled.
      for (const line of order.lines) {
        if (classifyLine(line, kpiIndex, groupIndex) !== 'kpi') continue
        const unit = kpiIndex.get(normaliseCode(line.productCode)) ?? 0
        draft.kpiRevenue = round2(draft.kpiRevenue + line.lineAmount)
        draft.kpiQty += line.qty
        const amount = round2(line.qty * unit)
        draft.kpiBase = round2(draft.kpiBase + amount)
        draft.lines.push({
          component: 'kpi_item',
          sourceOrderId: order.id,
          sourceLineId: line.id,
          basisAmount: line.lineAmount,
          rate: null,
          qty: line.qty,
          amount,
          note: `${order.orderNo} · ${line.productName ?? line.productCode} × ${line.qty} @ ${unit}`,
        })
      }

      // C3 — Open Bill: the 1st / 2nd / 3rd bill written on an event day.
      if (scheme.enableOpenBill) {
        const rank = tagByOrder.get(order.id)
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

      if (penaltyBand && withheldOnThisBill > 0) {
        draft.marginPenaltyWithheld = round2(draft.marginPenaltyWithheld + withheldOnThisBill)
        penalised.push({
          staffId: draft.staffId,
          orderId: order.id,
          orderNo: order.orderNo,
          brandCode: base.brandCode,
          marginPct: billMargin!,
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
      `${ordersWithoutCost} order(s) carry no cost data, so their margin could not be computed and the below-margin penalty was skipped. The ERP sales-order export has no cost column — a cost source is needed before the penalty can bite.`,
    )
  }

  // ── Pass E: overrides, off the settled per-person bases ────────────────
  if (scheme.enableOverride) {
    const baseByStaff = new Map<string, number>()
    for (const d of drafts.values()) {
      baseByStaff.set(
        d.staffId,
        scheme.overrideIncludesKpi ? round2(d.productRevenue + d.kpiRevenue) : d.productRevenue,
      )
    }

    for (const credit of computeOverrides(nodes, rateOf, baseByStaff, warnings)) {
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

  // ── Pass F: monthly margin incentive ───────────────────────────────────
  const monthlyMargin = new Map<string, { pct: number | null; brand: string | null; band: string | null }>()
  for (const d of drafts.values()) {
    let brand: string | null = null
    let best = -Infinity
    for (const [b, rev] of d.marginBrandRevenue) {
      if (rev > best) {
        best = rev
        brand = b
      }
    }
    const pct = marginPctOf({
      revenue: d.marginRevenue,
      cost: d.marginCost,
      complete: d.marginComplete,
      brandCode: brand,
    })

    let bandKey: string | null = null
    if (scheme.enableMarginIncentive && pct !== null) {
      const inc = marginIncentiveFor(pct, brand, input.marginBands)
      bandKey = inc.bandKey
      if (inc.amount > 0) {
        d.lines.push({
          component: 'margin_incentive',
          basisAmount: d.marginRevenue,
          rate: pct,
          qty: null,
          amount: inc.amount,
          note: `${inc.bandLabel} · ${round2(pct * 100)}% monthly margin${brand ? ` · ${brand}` : ''}`,
        })
      }
    }
    monthlyMargin.set(d.staffId, { pct, brand, band: bandKey })
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
    const totalCommission = round2(
      productCommission + kpiCommission + openBillBonus + overrideCommission + marginIncentive,
    )

    const rank = resolved.get(d.staffId)
    const margin = monthlyMargin.get(d.staffId)

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
      baseRankKey: d.node?.baseRankKey ?? null,
      rateMode: d.node?.rateMode ?? scheme.defaultRateMode,
      effectiveRankKey: rank?.effective?.rankKey ?? null,
      tierKey: rank?.effective?.tierKey ?? null,
      productRate: rateOf.get(d.staffId) ?? 0,
      qualifiesForRankKey: rank?.qualifiesFor?.rankKey ?? null,
      uplineStaffId: d.node?.uplineStaffId ?? null,
      productRevenue: d.productRevenue,
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
      marginRevenue: d.marginRevenue,
      marginCost: d.marginCost,
      marginPct: margin?.pct ?? null,
      marginBrandCode: margin?.brand ?? null,
      marginBandKey: margin?.band ?? null,
      marginIncentive,
      marginPenaltyWithheld: d.marginPenaltyWithheld,
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
