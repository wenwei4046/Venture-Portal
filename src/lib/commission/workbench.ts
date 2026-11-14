import {
  billMargin, brandKpiUnits, brandRateOf, classifyLine, computeCommissionRun, costBasisOf, EMPTY_KPI_INDEX, HALF_COMM, indexItemGroups,
  indexKpiItems, isDepositMet, marginBase, noSalesCost, orderRevenueSplit, ownSchemesOf, penaltyBandFor, round2,
} from './engine'
import { kpiItemLabel, kpiSourceOf, kpiUnitPay, type KpiHit } from './kpi'
import type { BillShare, EngineInput, EngineResult, MarginSource, SalesOrder, Statement } from './types'

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
  /** The ERP's Ref No. — the handwritten bill's number — and the paper number read from it (`paper-ref.ts`). */
  refNo?: string | null
  paperNo?: string | null
  /**
   * The month the bill was sold in by its fair (`saleMonthOf`, 2026-10-12):
   * one keyed after its fair's month sits — and is paid — where it was keyed,
   * a *Late key-in* on the ledger (`row-origin.ts`). Null or absent: no fair.
   */
  saleMonth?: string | null
}

export interface WorkbenchOptions {
  excludedOrderIds?: readonly string[]
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
  /**
   * The paper beside the document (2026-10-03): the ERP's Ref No. as typed —
   * HC13369 on HC-SO-2609-400 — and the paper number the double-claim check
   * reads from it. Both null on an upsale, which is no bill.
   */
  refNo: string | null
  paperNo: string | null
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
  /**
   * An old bill topped up (2026-11-07): it pays its holder the rate — cut by
   * its own margin as any bill's — and is no sale of theirs: out of every
   * sales, monthly margin, KPI and override figure. The builder always says;
   * absent reads as an ordinary bill.
   */
  commissionOnly?: boolean
  /**
   * Half comm (2026-11-10, `SalesOrder.halfComm`): its commission and its part
   * of the override are halved; its sales and KPI are whole. Absent: paid in full.
   */
  halfComm?: boolean
  /**
   * No commission (2026-11-14, `SalesOrder.noCommission`): nobody is paid on it —
   * no commission, no override, no KPI, none of the month's incentive — while it
   * counts in sales, margin and the KPI count. Absent: it pays.
   */
  noComm?: boolean
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
  /**
   * The bill has no sales of its own — a gift on a bill of its own — and every goods line is costed (2026-10-30): no
   * margin to read, its cost (`marginCost`) counted against the month.
   */
  noSales?: boolean
  /**
   * The bill is of a brand that follows its own scheme (2026-11-11 — 2990s): paid at that brand's rate for the rung
   * (`productRate` is it), in no margin — `marginPct` null is no cost waiting, there is no margin to read — and its
   * override is its brand's. The brand's code; absent on every other bill.
   */
  ownBrand?: string
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
  penaltyMultiplier: number
  penaltyWithheld: number
  totalCommission: number
  /**
   * Who holds a shared bill (2026-09-30), named: the row is ONE holder's part
   * (`staffId`), and this says whose bill it is and who holds the rest.
   * Absent or null: a bill with one salesperson.
   */
  share?: RowShare | null
}

/** A shared bill's holders, as a ledger names them. */
export interface RowShare {
  ownerStaffId: string
  ownerName: string
  /** Every holder with their part (0.5 = half), the owner first. */
  parts: { staffId: string; name: string; pct: number }[]
  /** The whole bill's total, before it was split. */
  wholeTotal: number
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
  /**
   * A director's fixed amount and threshold incentive (Rules › Directors,
   * 2026-09-27): monthly, never order commission. 0 for anybody else.
   */
  monthlyDirectorPay: number
  totalCommission: number
  /** Must be zero: displayed rows plus the monthly awards equal the engine. */
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
  /**
   * A brand's own item (2026-11-12 — a brand on its own commission scheme): the brand's code. `unitAmount` is then
   * what a unit pays at the month's tier, and it is paid whatever the sub-department's KPI switch says.
   */
  brandCode?: string
}

export interface CommissionWorkbench {
  result: EngineResult
  people: WorkbenchPerson[]
  personalRows: CommissionOrderRow[]
  overridingRows: OverrideOrderRow[]
  kpi: KpiAgentSummary[]
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
 * Everybody the board can list, for a loader to read the names of (2026-10-14):
 * the team, whoever holds a bill, and every director. The engine gives a
 * director with an amount to be paid a line in a month they sold nothing, so
 * names read for the team and the bills alone left PETER and KRIS listed by
 * their ids on September's Comm Cal.
 */
export function workbenchStaffIds(input: EngineInput): string[] {
  return [...new Set([
    ...input.hierarchy.map(node => node.staffId),
    ...input.orders.map(order => order.staffId),
    ...(input.directors ?? []).map(director => director.staffId),
  ])]
}

/**
 * Live/draft ledger over the production engine. Exclusions affect the entire
 * original bill, including every shared part and every upline's calculation.
 * Release flags are respected; the loader must choose the appropriate release
 * scope for a current-run preview versus a future run.
 */
export function buildCommissionWorkbench(input: EngineInput, options: WorkbenchOptions = {}): CommissionWorkbench {
  const excluded = new Set(options.excludedOrderIds ?? [])
  const effectiveInput: EngineInput = {
    ...input,
    orders: input.orders.filter(order => !excluded.has(order.id)),
  }
  const result = computeCommissionRun(effectiveInput)
  const statements = new Map(result.statements.map(statement => [statement.staffId, statement]))
  const personMeta = new Map((options.people ?? []).map(person => [person.staffId, person]))
  const orderMeta = new Map((options.orders ?? []).map(order => [order.orderId, order]))
  const hierarchy = new Map(input.hierarchy.map(node => [node.staffId, node]))
  // The KPI items a bill may carry, as the engine reads them: none of the sub-department's on a bill of a brand with
  // its own scheme (2026-11-11) — that brand's own instead (2026-11-12), paid whatever the sub-department's KPI switch
  // says — every configured one for what was SOLD, those the scheme pays for what is PAID.
  const configuredKpi = ownSchemesOf(input, indexKpiItems(input.kpiItems))
  const paidKpi = ownSchemesOf(input, input.scheme.enableKpi ? indexKpiItems(input.kpiItems) : EMPTY_KPI_INDEX)
  const ownBrandOf = paidKpi.brandOf
  const groupIndex = indexItemGroups(input.scheme.itemGroups)
  const costBasis = costBasisOf(input.scheme.costDivisor, input.scheme.costRatios, input.scheme.costRatiosByBrand)
  const nameOf = (staffId: string) => personMeta.get(staffId)?.name ?? staffId
  const rankOf = (staffId: string) => input.ranks.find(rank =>
    rank.rankKey === (statements.get(staffId)?.effectiveRankKey ?? hierarchy.get(staffId)?.baseRankKey))
  const titleOf = (staffId: string) => personMeta.get(staffId)?.titleLabel
    ?? input.ranks.find(rank => rank.titleId === hierarchy.get(staffId)?.titleId)?.titleLabel
    ?? rankOf(staffId)?.titleLabel ?? null
  const overrideBases = new Map<string, number>()
  const ladderBases = new Map<string, number>()
  // Every part of a shared bill carries the same `share`: named once per bill.
  const named = new Map<BillShare, RowShare>()
  const shareOf = (share: BillShare | undefined): RowShare | null => {
    if (!share) return null
    let row = named.get(share)
    if (!row) {
      const parts = share.parts.map(part => ({ staffId: part.staffId, name: nameOf(part.staffId), pct: part.pct }))
      const owner = parts.filter(part => part.staffId === share.ownerStaffId)
      const others = parts.filter(part => part.staffId !== share.ownerStaffId).sort((a, b) => a.name.localeCompare(b.name))
      row = {
        ownerStaffId: share.ownerStaffId, ownerName: nameOf(share.ownerStaffId),
        // The owner first, then A→Z — the order every view names them in.
        parts: [...owner, ...others],
        wholeTotal: share.wholeTotal,
      }
      named.set(share, row)
    }
    return row
  }

  const personalRows: CommissionOrderRow[] = input.orders.map(order => {
    const statement = statements.get(order.staffId)
    const meta = orderMeta.get(order.id)
    const kpiIndex = paidKpi.kpiIndexFor(order)
    // A brand with its own scheme (2026-11-11): no margin to read, whatever its lines cost.
    const ownBrand = ownBrandOf(order)
    const base = marginBase(order.lines, kpiIndex, groupIndex, costBasis, order.brandCode ?? null)
    const margin = ownBrand ? { pct: null, source: 'none' as const, cost: 0 } : billMargin(order, base)
    const giftCost = ownBrand ? undefined : noSalesCost(order.lines, base, groupIndex)
    const noSales = typeof giftCost === 'number' && margin.pct === null
    const split = orderRevenueSplit(order, kpiIndex, groupIndex)
    const productRevenue = split.main
    const status: CommissionOrderStatus = excluded.has(order.id) ? 'excluded'
      : order.alreadyReleased ? 'already_released'
        : !order.upsale && !isDepositMet(order, input.scheme.depositThresholdPct) ? 'deposit_pending' : 'eligible'
    const eligible = status === 'eligible'
    // An old bill topped up (2026-11-07): the rate on it, scaled by its margin
    // as any bill's ("need follow the margin as well") — and no upline is paid
    // on it, nor is it in any margin of the month's.
    const commissionOnly = !!order.commissionOnly
    const penalty = input.scheme.enableMarginPenalty && margin.pct !== null
      ? penaltyBandFor(margin.pct, base.brandCode, input.marginBands) : null
    const multiplier = penalty?.commissionMultiplier ?? 1
    const sourceLines = eligible ? statement?.lines.filter(line => line.sourceOrderId === order.id) ?? [] : []
    const component = (kind: 'product_revenue' | 'kpi_item') => sum(sourceLines.filter(line => line.component === kind).map(line => line.amount))
    const key = `${order.staffId}:${order.id}`
    // The sub-department's own KPI allowance on the bill — what its quantity ladder's bonus rides on. A brand's own
    // item (2026-11-12) is no part of that ladder.
    ladderBases.set(key, sum(sourceLines.filter(line => line.component === 'kpi_item' && !line.brandCode).map(line => line.amount)))
    const kpiRevenue = split.kpiAmount
    // Half comm (2026-11-10): the bill's part of the override base is halved, as the engine's is — its KPI is not.
    // No commission (2026-11-14): none of it — the bill pays nobody, its KPI included.
    const noComm = !!order.noCommission
    const half = noComm ? 0 : order.halfComm ? HALF_COMM : 1
    overrideBases.set(key, eligible && !commissionOnly && !noComm ? round2(round2(productRevenue * multiplier * half) + (input.scheme.overrideIncludesKpi ? kpiRevenue : 0)) : 0)
    return {
      key, orderId: order.id, originalOrderId: order.id, orderNo: order.orderNo,
      refNo: meta?.refNo ?? null, paperNo: meta?.paperNo ?? null,
      orderDate: order.orderDate, eventDate: order.eventDate, periodMonth: order.periodMonth,
      staffId: order.staffId, staffName: nameOf(order.staffId),
      venue: meta?.venue ?? null, eventName: meta?.eventName ?? null,
      organizer: meta?.organizer ?? null, location: meta?.location ?? null,
      // The bill's brand is the one it was written under — a pillow of another
      // brand riding on it does not make it that brand's too (2026-09-27).
      brands: order.brandCode ? [order.brandCode] : [...new Set(order.lines.flatMap(line => line.brandCode ? [line.brandCode] : []))],
      categories: [...new Set(order.lines.map(line => line.itemGroup))],
      upsale: !!order.upsale, commissionOnly, ...(order.halfComm && !noComm ? { halfComm: true } : {}),
      ...(noComm ? { noComm: true } : {}), orderTotal: order.orderTotal,
      commissionableValue: orderCommissionableValue(order, groupIndex),
      paidAmount: order.paidAmount,
      productRevenue, marginRevenue: ownBrand ? 0 : base.revenue,
      marginCost: noSales && typeof giftCost === 'number' ? giftCost : margin.source === 'none' ? null : margin.cost,
      marginPct: margin.pct, marginSource: margin.source, ...(noSales ? { noSales: true } : {}),
      ...(ownBrand ? { ownBrand } : {}), status,
      // What the bill is paid at: the rung's rate — the rung's rate for the brand, on a bill of a brand with its own
      // scheme. A package holder's own bills are paid no percentage on any brand.
      productRate: ownBrand
        ? ((rankOf(order.staffId)?.groupIncentiveAmount ?? 0) > 0 ? 0 : brandRateOf(rankOf(order.staffId), ownBrand, input.ranks))
        : statement?.productRate ?? rankOf(order.staffId)?.productRate ?? 0,
      productCommission: component('product_revenue'),
      kpiQty: sourceLines.filter(line => line.component === 'kpi_item').reduce((qty, line) => qty + (line.qty ?? 0), 0),
      kpiBase: component('kpi_item'), kpiBonus: 0,
      kpiThresholdPct: eligible && !commissionOnly && !noComm ? statement?.kpiThresholdPct ?? 0 : 0,
      marginIncentive: 0, marginAllocationBasis: null,
      penaltyMultiplier: multiplier,
      penaltyWithheld: eligible ? sum(result.penalised.filter(row => row.staffId === order.staffId && row.orderId === order.id).map(row => row.withheld)) : 0,
      totalCommission: 0,
      share: shareOf(order.share),
    }
  })

  const staffIds = new Set([...input.hierarchy.map(node => node.staffId), ...input.orders.map(order => order.staffId), ...statements.keys()])
  const people: WorkbenchPerson[] = [...staffIds].map(staffId => {
    const statement = statements.get(staffId) ?? null
    const rows = personalRows.filter(row => row.staffId === staffId)
    const kpiBonus = sum((statement?.lines ?? []).filter(line => line.component === 'kpi_threshold').map(line => line.amount))
    const bonuses = allocateCommissionAmount(kpiBonus, rows.map(row => ladderBases.get(row.key) ?? 0))
    // An old bill topped up is in no margin (2026-11-07): none of the month's incentive rides on it. Nor is a bill of
    // a brand with its own scheme (2026-11-11).
    const inMargin = (row: CommissionOrderRow) => row.status === 'eligible' && !row.commissionOnly && !row.ownBrand
    // A no-commission bill (2026-11-14) counts in the month's margin and pays nobody: none of the incentive is shown
    // on it — unless the month's margin bills are all such bills, when the incentive still has to sit somewhere.
    const marginWeight = (row: CommissionOrderRow, withNoComm: boolean) =>
      inMargin(row) && (withNoComm || !row.noComm) ? Math.max(0, row.marginRevenue) : 0
    const paying = rows.map(row => marginWeight(row, false))
    const marginWeights = paying.some(weight => weight > 0) ? paying : rows.map(row => marginWeight(row, true))
    const margins = allocateCommissionAmount(statement?.marginIncentive ?? 0, marginWeights)
    rows.forEach((row, index) => {
      row.kpiBonus = bonuses[index]
      row.marginIncentive = margins[index]
      row.marginAllocationBasis = statement?.marginIncentive && marginWeights[index] > 0 ? 'eligible_goods_revenue' : null
      row.totalCommission = sum([row.productCommission, row.kpiBase, row.kpiBonus, row.marginIncentive])
    })

    const overridingRows: OverrideOrderRow[] = (statement?.lines ?? [])
      .filter(line => line.component === 'override' && line.sourceStaffId)
      .flatMap(line => {
        const downline = line.sourceStaffId!
        // One override line a downline — and one more for each brand paid at its own rate (2026-11-11): each is put
        // on the bills it was earned on.
        const sourceRows = personalRows.filter(row => row.staffId === downline && row.status === 'eligible'
          && (row.ownBrand ?? '') === (line.brandCode ?? '') && (overrideBases.get(row.key) ?? 0) !== 0)
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
    const monthlyDirectorPay = round2((statement?.directorFixed ?? 0) + (statement?.directorIncentive ?? 0))
    const totalCommission = statement?.totalCommission ?? 0
    return {
      staffId, name: nameOf(staffId), employeeCode: personMeta.get(staffId)?.employeeCode ?? null,
      titleLabel: titleOf(staffId), rankLabel: rankOf(staffId)?.label ?? null,
      productRate: statement?.productRate ?? rankOf(staffId)?.productRate ?? 0,
      statement, personalRows: rows, overridingRows, personalTotal, overrideTotal,
      monthlyGroupIncentive, monthlyDirectorPay, totalCommission,
      reconciliationDifference: round2(totalCommission - personalTotal - overrideTotal - monthlyGroupIncentive - monthlyDirectorPay),
    }
  }).sort((a, b) => a.name.localeCompare(b.name))

  // A department head is paid no KPI allowance on their own bills (their rate
  // and nothing else, 2026-09-27): the KPI tab must not say otherwise.
  const heads = new Set([...(input.departmentHeadIds ?? []), ...(input.directors ?? []).map(d => d.staffId)])
  const kpi: KpiAgentSummary[] = people.map(person => {
    const items = new Map<string, KpiItemSummary>()
    const rows = new Map(person.personalRows.map(row => [row.orderId, row]))
    // An old bill topped up is no sale of theirs, so it moves no KPI item (2026-11-07).
    const theirs = input.orders.filter(order => order.staffId === person.staffId && !order.commissionOnly)
    // A brand's own items pay by the month's units (2026-11-12) — counted over the bills the run pays this person,
    // as the engine counts them.
    const brandUnits = heads.has(person.staffId)
      ? new Map<string, number>()
      : brandKpiUnits(theirs.filter(order => rows.get(order.id)?.status === 'eligible'), paidKpi.kpiIndexFor, groupIndex)
    const unitPay = (hit: KpiHit) => hit.item.brandCode ? kpiUnitPay(hit.item, brandUnits.get(hit.itemKey) ?? 0) : hit.item.kpiAmount
    for (const order of theirs) {
      const row = rows.get(order.id)!
      // Found with every configured item, KPI pay on or off: what was SOLD.
      // What was PAID is the engine's — an eligible bill, KPI switched on (a
      // brand's own item is paid whatever the switch says), its sales covering
      // its items — and it paid each exactly its amount: a brand's own item,
      // its amount a unit at the month's tier.
      const found = orderRevenueSplit(order, configuredKpi.kpiIndexFor(order), groupIndex)
      const hits = found.foundHits
      const settled = row.status === 'eligible' && !found.uncovered && !heads.has(person.staffId)
      const paidHit = (hit: KpiHit) => settled && (!!hit.item.brandCode || input.scheme.enableKpi)
      const bases = hits.map(hit => !paidHit(hit) ? 0 : hit.item.brandCode ? round2(hit.qty * unitPay(hit)) : hit.amount)
      // The quantity ladder's bonus rides on the sub-department's own items alone.
      const bonuses = allocateCommissionAmount(row.kpiBonus, hits.map((hit, index) => (hit.item.brandCode ? 0 : bases[index])))
      hits.forEach((hit, index) => {
        const paid = paidHit(hit)
        const lineName = order.lines.find(line => line.id === hit.lineId)?.productName
        const item = items.get(hit.itemKey) ?? {
          itemKey: hit.itemKey,
          source: kpiSourceOf(hit.item),
          productCode: kpiSourceOf(hit.item) === 'sku'
            ? (hit.item.productCode ?? '').trim().toUpperCase()
            : (hit.item.optionValue ?? '').trim(),
          productName: kpiSourceOf(hit.item) === 'sku' && !hit.item.label && lineName ? lineName : kpiItemLabel(hit.item),
          qty: 0, heldQty: 0, excludedQty: 0, payableQty: 0,
          unitAmount: unitPay(hit), base: 0, bonus: 0, total: 0,
          ...(hit.item.brandCode ? { brandCode: hit.item.brandCode } : {}),
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
    // A brand's own items are outside the statement's ladder figures (kpiQty, kpiBase): added here, as paid.
    const ofBrands = perItem.filter(item => item.brandCode)
    return {
      staffId: person.staffId, name: person.name,
      soldQty: perItem.reduce((qty, item) => qty + item.qty, 0),
      heldQty: perItem.reduce((qty, item) => qty + item.heldQty, 0),
      excludedQty: perItem.reduce((qty, item) => qty + item.excludedQty, 0),
      qty: (person.statement?.kpiQty ?? 0) + ofBrands.reduce((qty, item) => qty + item.payableQty, 0),
      base: round2((person.statement?.kpiBase ?? 0) + sum(ofBrands.map(item => item.base))),
      bonus: sum(person.personalRows.map(row => row.kpiBonus)),
      thresholdPct: person.statement?.kpiThresholdPct ?? 0, total: person.statement?.kpiCommission ?? 0,
      perItem,
    }
  })

  return {
    result, people, personalRows, overridingRows: people.flatMap(person => person.overridingRows),
    kpi,
    totalCommission: result.totalCommission,
  }
}
