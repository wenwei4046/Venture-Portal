import {
  billMargin, classifyLine, computeCommissionRun, costBasisOf, EMPTY_KPI_INDEX, indexItemGroups,
  indexKpiItems, isDepositMet, marginBase, orderKpiHits, orderRevenueSplit, penaltyBandFor, round2,
} from './engine'
import { kpiItemLabel, kpiSourceOf } from './kpi'
import type { EngineInput, EngineResult, MarginSource, OpenBillTag, SalesOrder, Statement } from './types'

/** Display metadata only; financial facts always come from EngineInput. */
export interface WorkbenchPersonMeta {
  staffId: string
  name: string
  employeeCode?: string | null
  titleLabel?: string | null
}

export interface WorkbenchOrderMeta {
  orderId: string
  venue?: string | null
  eventName?: string | null
  organizer?: string | null
  location?: string | null
  /** The fair the calendar placed the bill at, and that fair's own place. */
  fair?: { id: string; venueKey: string; venueName: string } | null
}

export interface WorkbenchOptions {
  excludedOrderIds?: readonly string[]
  openBillTags?: readonly OpenBillTag[]
  people?: readonly WorkbenchPersonMeta[]
  orders?: readonly WorkbenchOrderMeta[]
}

export type CommissionOrderStatus = 'eligible' | 'deposit_pending' | 'already_released' | 'excluded'

export interface CommissionOrderRow {
  /** Unique within a personal table. Shared bills retain the same originalOrderId. */
  key: string
  orderId: string
  originalOrderId: string
  orderNo: string
  orderDate: string
  eventDate: string
  periodMonth: string
  staffId: string
  staffName: string
  venue: string | null
  eventName: string | null
  organizer: string | null
  location: string | null
  brands: string[]
  categories: string[]
  upsale: boolean
  /** Everything on the bill — transport, disposal and every other charge included. */
  orderTotal: number
  /**
   * The part of the bill that earns commission — product commission or KPI —
   * under the scheme's switches as they stand. `orderTotal − commissionableValue`
   * is what the bill carries that earns nothing: transport, disposal, service.
   */
  commissionableValue: number
  paidAmount: number
  /** Original assigned share of revenue, retained when a row is excluded. */
  productRevenue: number
  marginRevenue: number
  marginCost: number | null
  marginPct: number | null
  marginSource: MarginSource
  status: CommissionOrderStatus
  productRate: number
  productCommission: number
  kpiQty: number
  kpiBase: number
  kpiBonus: number
  kpiThresholdPct: number
  /** Display allocation of the monthly award, not an extra order-level award. */
  marginIncentive: number
  marginAllocationBasis: 'eligible_goods_revenue' | null
  openBillRank: 1 | 2 | 3 | null
  openBillRate: number
  openBillBonus: number
  penaltyMultiplier: number
  penaltyWithheld: number
  totalCommission: number
}

/** The seller fields describe the downline; beneficiaryStaffId receives this amount. */
export interface OverrideOrderRow extends CommissionOrderRow {
  beneficiaryStaffId: string
  downlineStaffId: string
  downlineName: string
  downlineTitle: string | null
  downlineRank: string | null
  overrideBasis: number
  overrideRate: number
  overrideAmount: number
}

export interface WorkbenchPerson {
  staffId: string
  name: string
  employeeCode: string | null
  titleLabel: string | null
  rankLabel: string | null
  productRate: number
  statement: Statement | null
  personalRows: CommissionOrderRow[]
  overridingRows: OverrideOrderRow[]
  personalTotal: number
  overrideTotal: number
  /** Fixed group awards are monthly lines, never disguised as order commission. */
  monthlyGroupIncentive: number
  totalCommission: number
  /** Must be zero: displayed rows plus monthly group award equal the engine. */
  reconciliationDifference: number
}

export interface KpiAgentSummary {
  staffId: string
  name: string
  /** Imported sales facts, including held/released/draft-excluded orders, even with KPI pay disabled. */
  soldQty: number
  heldQty: number
  excludedQty: number
  /** Quantity paid by the engine; distinct from the quantity sold. */
  qty: number
  base: number
  bonus: number
  thresholdPct: number
  total: number
  perItem: KpiItemSummary[]
}

export interface KpiItemSummary {
  /** `kpiItemKey`: one row per item, a SKU or a special. */
  itemKey: string
  source: 'sku' | 'option'
  /** The SKU's code, or the special as its pool spells it. */
  productCode: string
  productName: string
  /** Quantity sold. Shared order parts sum back to the whole bill's quantity. */
  qty: number
  heldQty: number
  excludedQty: number
  payableQty: number
  unitAmount: number
  /** Actual engine expense, zero while the component is disabled or the order is held. */
  base: number
  bonus: number
  total: number
}

export interface CommissionWorkbench {
  result: EngineResult
  people: WorkbenchPerson[]
  personalRows: CommissionOrderRow[]
  overridingRows: OverrideOrderRow[]
  kpi: KpiAgentSummary[]
  openBillRows: CommissionOrderRow[]
  totalCommission: number
}

function sum(values: readonly number[]): number {
  return round2(values.reduce((total, value) => total + value, 0))
}

/**
 * What on a bill earns commission (2026-09-26): every line in a commissionable
 * group — its main sales earn the rate and its KPI items' amounts are paid as
 * KPI, both out of these lines (2026-09-27). A transport charge, a disposal
 * request, any group the scheme marks as not commissionable and any group it
 * has never heard of earn nothing, so they are the difference between this
 * and the bill's total.
 */
export function orderCommissionableValue(
  order: Pick<SalesOrder, 'lines'>,
  groupIndex: Map<string, boolean>,
): number {
  return sum(order.lines
    .filter(line => classifyLine(line, groupIndex) === 'commissionable')
    .map(line => line.lineAmount))
}

/**
 * Apportion an existing engine amount to the sen. Largest remainders absorb
 * rounding; signed weights retain refunds rather than silently dropping them.
 * This never decides an entitlement, it only explains a monthly engine line.
 */
export function allocateCommissionAmount(amount: number, weights: readonly number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0)
  const target = Math.round(round2(amount) * 100)
  if (target === 0) return weights.map(() => 0)
  if (weights.length === 0 || Math.abs(total) < 1e-9) {
    throw new Error('Cannot allocate a non-zero commission without a non-zero source basis.')
  }
  const raw = weights.map(weight => target * weight / total)
  const cents = raw.map(value => Math.trunc(value))
  const remainder = target - cents.reduce((a, b) => a + b, 0)
  const direction = Math.sign(remainder)
  const priorities = raw.map((value, index) => ({ index, residual: value - cents[index] }))
    .filter(({ index }) => weights[index] !== 0)
    .sort((a, b) => direction * (b.residual - a.residual) || a.index - b.index)
  for (let i = 0; i < Math.abs(remainder); i++) cents[priorities[i % priorities.length].index] += direction
  return cents.map(value => value / 100)
}

/**
 * Live/draft ledger over the production engine. Exclusions affect the entire
 * original bill, including every shared part and every upline's calculation.
 * Release flags are respected; the loader must choose the appropriate release
 * scope for a current-run preview versus a future run.
 */
export function buildCommissionWorkbench(input: EngineInput, options: WorkbenchOptions = {}): CommissionWorkbench {
  const excluded = new Set(options.excludedOrderIds ?? [])
  const tags = [...(options.openBillTags ?? input.openBillTags)]
  const effectiveInput: EngineInput = {
    ...input,
    orders: input.orders.filter(order => !excluded.has(order.id)),
    openBillTags: tags,
  }
  const result = computeCommissionRun(effectiveInput)
  const statements = new Map(result.statements.map(statement => [statement.staffId, statement]))
  const personMeta = new Map((options.people ?? []).map(person => [person.staffId, person]))
  const orderMeta = new Map((options.orders ?? []).map(order => [order.orderId, order]))
  const hierarchy = new Map(input.hierarchy.map(node => [node.staffId, node]))
  const configuredKpiIndex = indexKpiItems(input.kpiItems)
  const kpiIndex = input.scheme.enableKpi ? configuredKpiIndex : EMPTY_KPI_INDEX
  const groupIndex = indexItemGroups(input.scheme.itemGroups)
  const costBasis = costBasisOf(input.scheme.costDivisor, input.scheme.costRatios)
  const tagByOrder = new Map(tags.map(tag => [tag.orderId, tag.rank]))
  const openBillRates = new Map(input.openBillRules.map(rule => [rule.rank, rule.pct]))
  const nameOf = (staffId: string) => personMeta.get(staffId)?.name ?? staffId
  const rankOf = (staffId: string) => input.ranks.find(rank =>
    rank.rankKey === (statements.get(staffId)?.effectiveRankKey ?? hierarchy.get(staffId)?.baseRankKey))
  const titleOf = (staffId: string) => personMeta.get(staffId)?.titleLabel
    ?? input.ranks.find(rank => rank.titleId === hierarchy.get(staffId)?.titleId)?.titleLabel
    ?? rankOf(staffId)?.titleLabel ?? null
  const overrideBases = new Map<string, number>()

  const personalRows: CommissionOrderRow[] = input.orders.map(order => {
    const statement = statements.get(order.staffId)
    const meta = orderMeta.get(order.id)
    const base = marginBase(order.lines, kpiIndex, groupIndex, costBasis)
    const margin = billMargin(order, base)
    const split = orderRevenueSplit(order, kpiIndex, groupIndex)
    const productRevenue = split.main
    const status: CommissionOrderStatus = excluded.has(order.id) ? 'excluded'
      : order.alreadyReleased ? 'already_released'
        : !order.upsale && !isDepositMet(order, input.scheme.depositThresholdPct) ? 'deposit_pending' : 'eligible'
    const eligible = status === 'eligible'
    const penalty = input.scheme.enableMarginPenalty && margin.pct !== null
      ? penaltyBandFor(margin.pct, base.brandCode, input.marginBands) : null
    const multiplier = penalty?.commissionMultiplier ?? 1
    const sourceLines = eligible ? statement?.lines.filter(line => line.sourceOrderId === order.id) ?? [] : []
    const component = (kind: 'product_revenue' | 'kpi_item' | 'open_bill') => sum(sourceLines.filter(line => line.component === kind).map(line => line.amount))
    const key = `${order.staffId}:${order.id}`
    const kpiRevenue = split.kpiAmount
    overrideBases.set(key, eligible ? round2(round2(productRevenue * multiplier) + (input.scheme.overrideIncludesKpi ? kpiRevenue : 0)) : 0)
    const openBillRank = order.upsale ? null : tagByOrder.get(order.id) ?? null
    return {
      key, orderId: order.id, originalOrderId: order.id, orderNo: order.orderNo,
      orderDate: order.orderDate, eventDate: order.eventDate, periodMonth: order.periodMonth,
      staffId: order.staffId, staffName: nameOf(order.staffId),
      venue: meta?.venue ?? null, eventName: meta?.eventName ?? null,
      organizer: meta?.organizer ?? null, location: meta?.location ?? null,
      brands: [...new Set(order.lines.flatMap(line => line.brandCode ? [line.brandCode] : []))],
      categories: [...new Set(order.lines.map(line => line.itemGroup))],
      upsale: !!order.upsale, orderTotal: order.orderTotal,
      commissionableValue: orderCommissionableValue(order, groupIndex),
      paidAmount: order.paidAmount,
      productRevenue, marginRevenue: base.revenue,
      marginCost: margin.source === 'none' ? null : margin.cost,
      marginPct: margin.pct, marginSource: margin.source, status,
      productRate: statement?.productRate ?? rankOf(order.staffId)?.productRate ?? 0,
      productCommission: component('product_revenue'),
      kpiQty: sourceLines.filter(line => line.component === 'kpi_item').reduce((qty, line) => qty + (line.qty ?? 0), 0),
      kpiBase: component('kpi_item'), kpiBonus: 0,
      kpiThresholdPct: eligible ? statement?.kpiThresholdPct ?? 0 : 0,
      marginIncentive: 0, marginAllocationBasis: null,
      openBillRank, openBillRate: openBillRank ? openBillRates.get(openBillRank) ?? 0 : 0,
      openBillBonus: component('open_bill'), penaltyMultiplier: multiplier,
      penaltyWithheld: eligible ? sum(result.penalised.filter(row => row.staffId === order.staffId && row.orderId === order.id).map(row => row.withheld)) : 0,
      totalCommission: 0,
    }
  })

  const staffIds = new Set([...input.hierarchy.map(node => node.staffId), ...input.orders.map(order => order.staffId), ...statements.keys()])
  const people: WorkbenchPerson[] = [...staffIds].map(staffId => {
    const statement = statements.get(staffId) ?? null
    const rows = personalRows.filter(row => row.staffId === staffId)
    const kpiBonus = sum((statement?.lines ?? []).filter(line => line.component === 'kpi_threshold').map(line => line.amount))
    const bonuses = allocateCommissionAmount(kpiBonus, rows.map(row => row.kpiBase))
    const margins = allocateCommissionAmount(statement?.marginIncentive ?? 0, rows.map(row => row.status === 'eligible' ? Math.max(0, row.marginRevenue) : 0))
    rows.forEach((row, index) => {
      row.kpiBonus = bonuses[index]
      row.marginIncentive = margins[index]
      row.marginAllocationBasis = statement?.marginIncentive && row.status === 'eligible' && row.marginRevenue > 0 ? 'eligible_goods_revenue' : null
      row.totalCommission = sum([row.productCommission, row.kpiBase, row.kpiBonus, row.openBillBonus, row.marginIncentive])
    })

    const overridingRows: OverrideOrderRow[] = (statement?.lines ?? [])
      .filter(line => line.component === 'override' && line.sourceStaffId)
      .flatMap(line => {
        const downline = line.sourceStaffId!
        const sourceRows = personalRows.filter(row => row.staffId === downline && row.status === 'eligible' && (overrideBases.get(row.key) ?? 0) !== 0)
        const amounts = allocateCommissionAmount(line.amount, sourceRows.map(row => overrideBases.get(row.key) ?? 0))
        return sourceRows.map((row, index) => ({
          ...row, key: `${staffId}:${row.key}`, beneficiaryStaffId: staffId,
          downlineStaffId: downline, downlineName: nameOf(downline),
          downlineTitle: titleOf(downline), downlineRank: rankOf(downline)?.label ?? null,
          overrideBasis: overrideBases.get(row.key) ?? 0, overrideRate: line.rate ?? 0,
          overrideAmount: amounts[index], totalCommission: amounts[index],
        }))
      })
    const personalTotal = sum(rows.map(row => row.totalCommission))
    const overrideTotal = sum(overridingRows.map(row => row.overrideAmount))
    const monthlyGroupIncentive = statement?.groupIncentive ?? 0
    const totalCommission = statement?.totalCommission ?? 0
    return {
      staffId, name: nameOf(staffId), employeeCode: personMeta.get(staffId)?.employeeCode ?? null,
      titleLabel: titleOf(staffId), rankLabel: rankOf(staffId)?.label ?? null,
      productRate: statement?.productRate ?? rankOf(staffId)?.productRate ?? 0,
      statement, personalRows: rows, overridingRows, personalTotal, overrideTotal,
      monthlyGroupIncentive, totalCommission,
      reconciliationDifference: round2(totalCommission - personalTotal - overrideTotal - monthlyGroupIncentive),
    }
  }).sort((a, b) => a.name.localeCompare(b.name))

  const kpi: KpiAgentSummary[] = people.map(person => {
    const items = new Map<string, KpiItemSummary>()
    const rows = new Map(person.personalRows.map(row => [row.orderId, row]))
    for (const order of input.orders.filter(order => order.staffId === person.staffId)) {
      const row = rows.get(order.id)!
      // Found with every configured item, KPI pay on or off: what was SOLD.
      // What was PAID is the engine's — an eligible bill, KPI switched on —
      // and it paid each item exactly its hit's amount.
      const hits = orderKpiHits(order, configuredKpiIndex)
      const paid = row.status === 'eligible' && input.scheme.enableKpi
      const bases = hits.map(hit => (paid ? hit.amount : 0))
      const bonuses = allocateCommissionAmount(row.kpiBonus, bases)
      hits.forEach((hit, index) => {
        const lineName = order.lines.find(line => line.id === hit.lineId)?.productName
        const item = items.get(hit.itemKey) ?? {
          itemKey: hit.itemKey,
          source: kpiSourceOf(hit.item),
          productCode: kpiSourceOf(hit.item) === 'sku'
            ? (hit.item.productCode ?? '').trim().toUpperCase()
            : (hit.item.optionValue ?? '').trim(),
          productName: kpiSourceOf(hit.item) === 'sku' && !hit.item.label && lineName ? lineName : kpiItemLabel(hit.item),
          qty: 0, heldQty: 0, excludedQty: 0, payableQty: 0,
          unitAmount: hit.item.kpiAmount, base: 0, bonus: 0, total: 0,
        }
        item.qty += hit.qty
        if (row.status === 'deposit_pending') item.heldQty += hit.qty
        if (row.status === 'excluded') item.excludedQty += hit.qty
        if (paid) item.payableQty += hit.qty
        item.base = round2(item.base + bases[index])
        item.bonus = round2(item.bonus + bonuses[index])
        item.total = round2(item.base + item.bonus)
        items.set(hit.itemKey, item)
      })
    }
    const perItem = [...items.values()].sort((a, b) => a.productCode.localeCompare(b.productCode))
    return {
      staffId: person.staffId, name: person.name,
      soldQty: perItem.reduce((qty, item) => qty + item.qty, 0),
      heldQty: perItem.reduce((qty, item) => qty + item.heldQty, 0),
      excludedQty: perItem.reduce((qty, item) => qty + item.excludedQty, 0),
      qty: person.statement?.kpiQty ?? 0,
      base: person.statement?.kpiBase ?? 0, bonus: sum(person.personalRows.map(row => row.kpiBonus)),
      thresholdPct: person.statement?.kpiThresholdPct ?? 0, total: person.statement?.kpiCommission ?? 0,
      perItem,
    }
  })

  return {
    result, people, personalRows, overridingRows: people.flatMap(person => person.overridingRows),
    kpi,
    openBillRows: personalRows.filter(row => row.openBillRank !== null),
    totalCommission: result.totalCommission,
  }
}
