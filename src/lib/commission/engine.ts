/**
 * Revenue Department commission engine — pure math, no I/O.
 *
 * Implements the **Fair** sub-department's ruleset (user brief 2026-08-31).
 * Four components, computed per salesperson per calendar month
 * (docs/module-spec-revenue-commission.md §3):
 *
 *   C1 product revenue  — PR × personal rate. Excludes KPI items and any item
 *                         group that isn't commissionable (TRANS, OTHER).
 *   C2 KPI items        — Σ(qty × kpiAmount) × (1 + threshold uplift)
 *   C3 Open Bill        — 1st/2nd/3rd bill of the event day: the order's
 *                         commission, then +50/40/30% on top
 *   C4 override         — differential roll-up over the upline chain
 *
 * Rounding rule: every statement LINE is rounded to 2dp, and every subtotal is
 * the sum of its rounded lines. That makes `Σ lines === total` exact, which is
 * the invariant the drill-down page and the apply RPC both rely on.
 */

import type {
  CommissionComponent,
  EngineInput,
  EngineResult,
  HierarchyNode,
  ItemGroupRule,
  KpiItem,
  KpiThreshold,
  OpenBillRank,
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

// ─── C2 helper — threshold ladder ───────────────────────────────────────────

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

// ─── C4 helper — differential roll-up ───────────────────────────────────────

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
 */
export function computeOverrides(
  nodes: Map<string, HierarchyNode>,
  baseByStaff: Map<string, number>,
  warnings: string[],
): OverrideCredit[] {
  const credits: OverrideCredit[] = []

  for (const [downlineStaffId, base] of baseByStaff) {
    if (base <= 0) continue
    const self = nodes.get(downlineStaffId)
    if (!self) continue

    let paid = self.productRate
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

      const diff = ancestor.productRate - paid
      if (diff > 0) {
        credits.push({
          uplineStaffId: ancestor.staffId,
          downlineStaffId,
          basisAmount: base,
          rate: diff,
          amount: round2(base * diff),
        })
        paid = ancestor.productRate
      }

      cursor = ancestor.uplineStaffId
    }
  }

  return credits
}

// ─── Engine ─────────────────────────────────────────────────────────────────

export function computeCommissionRun(input: EngineInput): EngineResult {
  const warnings: string[] = []
  const { scheme } = input
  const kpiIndex = scheme.enableKpi ? indexKpiItems(input.kpiItems) : new Map<string, number>()
  const groupIndex = indexItemGroups(scheme.itemGroups)

  const nodes = new Map<string, HierarchyNode>()
  for (const n of input.hierarchy) {
    if (nodes.has(n.staffId)) {
      warnings.push(`Staff ${n.staffId} has more than one active hierarchy row — using the first.`)
      continue
    }
    nodes.set(n.staffId, n)
  }

  // A rank below the recruiting threshold must not hold downlines. Flag rather
  // than silently paying (or silently dropping) their override.
  for (const n of nodes.values()) {
    if (n.uplineStaffId) {
      const up = nodes.get(n.uplineStaffId)
      if (up && !up.canRecruit) {
        warnings.push(
          `Staff ${n.staffId} is placed under ${up.staffId}, whose rank (${up.rankKey}) is not allowed to recruit.`,
        )
      }
    }
  }

  const openBillPct = new Map<OpenBillRank, number>(
    input.openBillRules.map(r => [r.rank, r.pct]),
  )
  const tagByOrder = new Map<string, OpenBillRank>(
    input.openBillTags.map(t => [t.orderId, t.rank]),
  )

  // Group orders by salesperson.
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

  // ── Pass 1: per-person own components + the override base ──────────────
  interface Draft {
    staffId: string
    node: HierarchyNode | undefined
    lines: StatementLine[]
    productRevenue: number
    excludedRevenue: number
    kpiRevenue: number
    kpiQty: number
    kpiBase: number
    kpiThresholdPct: number
  }
  const drafts = new Map<string, Draft>()

  for (const staffId of staffIds) {
    const node = nodes.get(staffId)
    const orders = ordersByStaff.get(staffId) ?? []
    const rate = node?.productRate ?? 0

    if (!node && orders.length > 0) {
      warnings.push(
        `Staff ${staffId} has sales this period but no rank / hierarchy row — commission computed at 0%.`,
      )
    }

    const lines: StatementLine[] = []
    let productRevenue = 0
    let excludedRevenue = 0
    let kpiRevenue = 0
    let kpiQty = 0
    let kpiBase = 0

    for (const order of orders) {
      const opr = orderProductRevenue(order, kpiIndex, groupIndex)
      productRevenue = round2(productRevenue + opr)

      // C1 — one line per order, so the drill-down reads like a ledger.
      if (scheme.enableProductRevenue && opr !== 0 && rate > 0) {
        lines.push({
          component: 'product_revenue',
          sourceOrderId: order.id,
          basisAmount: opr,
          rate,
          qty: null,
          amount: round2(opr * rate),
          note: `${order.orderNo} · ${order.orderDate}`,
        })
      }

      for (const line of order.lines) {
        const cls = classifyLine(line, kpiIndex, groupIndex)

        if (cls === 'excluded_group' || cls === 'unknown_group') {
          excludedRevenue = round2(excludedRevenue + line.lineAmount)
          continue
        }
        if (cls !== 'kpi') continue

        // C2 inputs — one line per KPI line item.
        const unit = kpiIndex.get(normaliseCode(line.productCode)) ?? 0
        kpiRevenue = round2(kpiRevenue + line.lineAmount)
        kpiQty += line.qty
        const amount = round2(line.qty * unit)
        kpiBase = round2(kpiBase + amount)
        lines.push({
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
    }

    // C2 threshold uplift — a single line on the whole KPI base.
    const thresholdPct = kpiThresholdPct(kpiQty, input.kpiThresholds)
    if (thresholdPct > 0 && kpiBase > 0) {
      lines.push({
        component: 'kpi_threshold',
        basisAmount: kpiBase,
        rate: thresholdPct,
        qty: kpiQty,
        amount: round2(kpiBase * thresholdPct),
        note: `${kpiQty} KPI items → +${round2(thresholdPct * 100)}% on ${kpiBase.toFixed(2)}`,
      })
    }

    // C3 — Open Bill: the 1st / 2nd / 3rd bill written on an event day.
    if (scheme.enableOpenBill) {
      for (const order of orders) {
        const rank = tagByOrder.get(order.id)
        if (rank === undefined) continue
        const pct = openBillPct.get(rank)
        if (pct === undefined) {
          warnings.push(
            `Order ${order.orderNo} is tagged Open Bill ${rank}, but no bonus rate is configured for that rank.`,
          )
          continue
        }
        const opr = orderProductRevenue(order, kpiIndex, groupIndex)
        const amount =
          scheme.openBillBasis === 'pct_of_revenue'
            ? round2(opr * pct)
            : round2(opr * rate * pct)
        if (amount === 0) continue
        lines.push({
          component: 'open_bill',
          sourceOrderId: order.id,
          basisAmount: opr,
          rate: pct,
          qty: null,
          amount,
          note:
            `${ordinal(rank)} bill · ${order.eventDate} · ${order.orderNo}` +
            (scheme.openBillBasis === 'pct_of_revenue'
              ? ` · ${round2(pct * 100)}% of revenue`
              : ` · +${round2(pct * 100)}% on ${round2(rate * 100)}% commission`),
        })
      }
    }

    drafts.set(staffId, {
      staffId,
      node,
      lines,
      productRevenue,
      excludedRevenue,
      kpiRevenue,
      kpiQty,
      kpiBase,
      kpiThresholdPct: thresholdPct,
    })
  }

  // ── Pass 2: overrides, off the settled per-person bases ────────────────
  if (scheme.enableOverride) {
    const baseByStaff = new Map<string, number>()
    for (const d of drafts.values()) {
      const base = scheme.overrideIncludesKpi
        ? round2(d.productRevenue + d.kpiRevenue)
        : d.productRevenue
      baseByStaff.set(d.staffId, base)
    }

    for (const credit of computeOverrides(nodes, baseByStaff, warnings)) {
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

  // ── Assemble ───────────────────────────────────────────────────────────
  const statements: Statement[] = []
  for (const d of drafts.values()) {
    const by = (c: CommissionComponent) =>
      sum(d.lines.filter(l => l.component === c).map(l => l.amount))

    const productCommission = by('product_revenue')
    const kpiCommission = round2(by('kpi_item') + by('kpi_threshold'))
    const openBillBonus = by('open_bill')
    const overrideCommission = by('override')
    const totalCommission = round2(
      productCommission + kpiCommission + openBillBonus + overrideCommission,
    )

    // A person with no orders, no downline volume and no rank contributes
    // nothing — don't clutter the run with empty statements.
    if (totalCommission === 0 && d.lines.length === 0 && d.productRevenue === 0) continue

    statements.push({
      staffId: d.staffId,
      tierKey: d.node?.tierKey ?? null,
      rankKey: d.node?.rankKey ?? null,
      productRate: d.node?.productRate ?? 0,
      uplineStaffId: d.node?.uplineStaffId ?? null,
      productRevenue: d.productRevenue,
      excludedRevenue: d.excludedRevenue,
      productCommission,
      kpiQty: d.kpiQty,
      kpiBase: d.kpiBase,
      kpiThresholdPct: d.kpiThresholdPct,
      kpiCommission,
      openBillBonus,
      overrideCommission,
      totalCommission,
      lines: d.lines,
    })
  }

  statements.sort((a, b) => b.totalCommission - a.totalCommission)

  return {
    periodMonth: input.periodMonth,
    statements,
    totalCommission: sum(statements.map(s => s.totalCommission)),
    warnings,
  }
}

function ordinal(n: OpenBillRank): string {
  return n === 1 ? '1st' : n === 2 ? '2nd' : '3rd'
}
