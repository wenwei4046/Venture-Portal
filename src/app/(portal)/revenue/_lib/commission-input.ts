import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows, fetchByKeys } from '@/lib/paginate'
import { monthsBefore } from '@/lib/commission/engine'
import { toEngineInput } from '@/lib/commission/run-payload'
import { monthCommissionableValue, needsMonthValue } from '@/lib/commission/director-pay'
import { carriesInto } from '@/lib/commission/carry'
import { officeToday } from '@/lib/office-time'
import { loadMonthOrders } from './month-orders'
import type {
  CostRatioRow,
  HierarchyRow,
  ItemGroupRow,
  KpiItemRow,
  KpiThresholdRow,
  MarginBandRow,
  OpenBillRuleRow,
  OpenBillTagRow,
  OrderShareRow,
  PriorMonthRow,
  RankRow,
  SalesLineRow,
  SalesOrderRow,
  SchemeRow,
} from '@/lib/commission/run-payload'
import type { DirectorTerms, EngineInput } from '@/lib/commission/types'
import type { UpsaleRow } from '@/lib/commission/upsales'

interface QueryResult {
  data: unknown[] | null
  error: { message: string } | null
}

/** Every financial input is paged, ordered, and fails loudly on read errors. */
async function readRows<T>(
  label: string,
  buildPage: (from: number, to: number) => PromiseLike<QueryResult>,
): Promise<T[]> {
  try {
    return await fetchAllRows<T>((from, to) =>
      buildPage(from, to) as PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
    )
  } catch (error) {
    throw new Error(`Could not read ${label}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Chunk the URL keys AND page each result: 100 orders can have >1,000 lines. */
async function readByKeys<T>(
  label: string,
  keys: readonly string[],
  buildPage: (chunk: string[], from: number, to: number) => PromiseLike<QueryResult>,
): Promise<T[]> {
  return fetchByKeys<T, string>(keys, async chunk => ({
    data: await readRows<T>(label, (from, to) => buildPage(chunk, from, to)),
    error: null,
  }))
}

/** A KPI item is a SKU or a Maintenance special (2026-09-27). */
const KPI_ITEM_COLUMNS = 'source, product_code, product_name, option_pool, option_value, kpi_amount'

function periodEnd(period: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(period)) {
    throw new Error('Period must be the first of a month, e.g. 2026-07-01')
  }
  const [year, month] = period.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

export interface CommissionInputContext {
  input: EngineInput
  /** Today's team, kept separate for an explicitly selected what-if preview. */
  currentHierarchy: EngineInput['hierarchy']
  /** Current effective dated rules; selecting these does not enable scheme switches. */
  currentRules: Pick<EngineInput, 'hierarchy' | 'kpiItems' | 'kpiThresholds' | 'openBillRules'>
  batchId: string
  schemeId: string
  subDepartmentId: string
  /** These orders never reach the engine because they have no matched person. */
  unmatchedOrderNos: string[]
}

export interface CommissionInputOptions {
  /** Preview-only reads; saving a run never depends on today's configuration. */
  includeCurrentRules?: boolean
  /**
   * Read-only replay of an existing run. Its own paid bills, including carried
   * bills, must still be visible; releases owned by every other run stay closed.
   * The saving action never uses this option.
   */
  replayRunId?: string
  /**
   * The month's bills as the page already read them (`revenue_month_orders`),
   * for the directors' incentive threshold — Comm Cal's Commissionable value
   * card. Absent, they are read here when a director's incentive needs them,
   * so the close the server recomputes judges the same figure.
   */
  monthOrders?: readonly { cancelled: boolean; commissionable: number }[]
}

/**
 * The shared source for commission previews and the saving action. Reads the
 * same Revenue Team rules, hierarchy, shares, upsales and carried orders for
 * both, without writing statements, releases, titles, or payroll. The caller
 * must authorize access before sending any of this data to a client.
 */
export async function loadCommissionInput(
  period: string,
  subDepartmentId?: string,
  existingClient?: SupabaseClient,
  options: CommissionInputOptions = {},
): Promise<CommissionInputContext> {
  const asAt = periodEnd(period)
  // The rules in force today — the office's today; the ISO string's date is UTC's.
  const currentDate = officeToday()
  const supabase = existingClient ?? (await createClient()) as unknown as SupabaseClient
  const schemes = await readRows<SchemeRow>('the commission scheme', (from, to) =>
    supabase.from('comm_schemes')
      .select('id, sub_department_id, open_bill_basis, override_includes_kpi, deposit_threshold_pct, default_rate_mode, enable_product_revenue, enable_kpi, enable_open_bill, enable_override, enable_margin_penalty, enable_margin_incentive, enable_group_incentive, group_sales_depth, override_depth, revenue_cost_divisor')
      .eq('is_active', true).is('effective_to', null).order('id').range(from, to),
  )
  if (schemes.length === 0) {
    throw new Error('No active commission scheme. Set one up under Revenue → Rules first.')
  }
  const scheme = subDepartmentId
    ? schemes.find(row => row.sub_department_id === subDepartmentId)
    : schemes.length === 1 ? schemes[0] : undefined
  if (!scheme) {
    throw new Error(subDepartmentId
      ? 'That sub-department has no active commission scheme.'
      : 'There is more than one sub-department — say which one to run.')
  }

  // The replayed run's check and the month's batch do not depend on each
  // other: asked together, one round trip instead of two (2026-09-26).
  const [replay, { data: batchRow, error: batchError }] = await Promise.all([
    options.replayRunId
      ? supabase.from('comm_runs').select('id')
        .eq('id', options.replayRunId).eq('period_month', period)
        .eq('sub_department_id', scheme.sub_department_id).maybeSingle()
      : Promise.resolve(null),
    supabase.from('sales_import_batches')
      .select('id').eq('sub_department_id', scheme.sub_department_id)
      .eq('period_month', period).eq('status', 'committed').maybeSingle(),
  ])
  if (replay) {
    if (replay.error) throw new Error(`Could not read the commission run: ${replay.error.message}`)
    if (!replay.data) throw new Error('The commission run does not belong to this month and sub-department.')
  }
  if (batchError) throw new Error(`Could not read the month's import: ${batchError.message}`)
  const batchId = (batchRow as { id: string } | null)?.id
  if (!batchId) throw new Error(`Nothing has been imported for ${period.slice(0, 7)} yet.`)

  // brand_code: the brand the bill was written under — it alone picks the
  // margin ladder; the brands of what rides on it do not (2026-09-27).
  const orderSelect = 'id, order_no, staff_id, order_date, event_date, period_month, order_total, paid_amount, manual_margin_pct, brand_code'
  const [thisMonth, earlier, releases, ranks, itemGroups, kpiItems, kpiThresholds,
    openBillRules, marginBands, hierarchy, upsales, currentHierarchyRows,
    currentKpiItems, currentKpiThresholds, currentOpenBillRules, cutover, openBillThisMonth,
    costRatios, heads, directorRows, directorPayRows, standingCloses, appliedRuns] = await Promise.all([
    readRows<SalesOrderRow>('the sales orders', (from, to) =>
      supabase.from('sales_orders').select(orderSelect).eq('batch_id', batchId)
        .eq('cancelled', false).order('id').range(from, to)),
    readRows<SalesOrderRow>('carried-forward orders', (from, to) =>
      supabase.from('sales_orders').select(`${orderSelect}, sales_import_batches!inner (status, sub_department_id)`)
        .lt('period_month', period).eq('cancelled', false)
        .eq('sales_import_batches.status', 'committed')
        .eq('sales_import_batches.sub_department_id', scheme.sub_department_id)
        .order('id').range(from, to)),
    readRows<{ order_no: string; run_id: string }>('released orders', (from, to) =>
      supabase.from('comm_order_releases').select('order_no, run_id')
        .eq('sub_department_id', scheme.sub_department_id).order('order_no').range(from, to)),
    readRows<RankRow>('commission ranks', (from, to) =>
      supabase.from('comm_ranks')
        .select('rank_key, title_id, titles (name), label, product_rate, group_incentive_amount, group_subsidy_cap, can_recruit, group_sales_threshold, personal_sales_threshold, consecutive_months, sort_order')
        .eq('scheme_id', scheme.id).order('sort_order').order('id').range(from, to)),
    readRows<ItemGroupRow>('commission item groups', (from, to) =>
      supabase.from('comm_item_groups').select('item_group, commissionable')
        .eq('scheme_id', scheme.id).order('id').range(from, to)),
    readRows<KpiItemRow>('KPI items', (from, to) =>
      supabase.from('comm_kpi_items').select(KPI_ITEM_COLUMNS)
        .eq('scheme_id', scheme.id).lte('effective_from', asAt)
        .or(`effective_to.is.null,effective_to.gte.${asAt}`).order('id').range(from, to)),
    readRows<KpiThresholdRow>('KPI thresholds', (from, to) =>
      supabase.from('comm_kpi_thresholds').select('min_qty, bonus_pct')
        .eq('scheme_id', scheme.id).lte('effective_from', asAt)
        .or(`effective_to.is.null,effective_to.gte.${asAt}`).order('id').range(from, to)),
    readRows<OpenBillRuleRow>('Open Bill rules', (from, to) =>
      supabase.from('comm_open_bill_rules').select('bill_rank, pct')
        .eq('scheme_id', scheme.id).lte('effective_from', asAt)
        .or(`effective_to.is.null,effective_to.gte.${asAt}`).order('id').range(from, to)),
    readRows<MarginBandRow>('margin bands', (from, to) =>
      supabase.from('comm_margin_bands')
        .select('band_key, label, kind, margin_pct, commission_multiplier, monthly_incentive, comm_brands (code)')
        .eq('scheme_id', scheme.id).order('sort_order').order('id').range(from, to)),
    readRows<HierarchyRow>('the Revenue Team hierarchy', (from, to) =>
      supabase.from('comm_hierarchy').select('staff_id, upline_staff_id, rate_mode, title_id, comm_ranks (rank_key)')
        .eq('scheme_id', scheme.id).lte('effective_from', asAt)
        .or(`effective_to.is.null,effective_to.gte.${asAt}`).order('id').range(from, to)),
    // Upsales and drops the run pays: CONFIRMED ones. A drop or upsell the ERP
    // revealed waits as pending until somebody answers it (2026-09-26).
    readRows<UpsaleRow>("the month's upsales and drops", (from, to) =>
      supabase.from('comm_upsales').select('id, staff_id, amount, sold_on, original_ref, kind')
        .eq('sub_department_id', scheme.sub_department_id).eq('period_month', period)
        .eq('status', 'confirmed')
        .order('id').range(from, to)),
    options.includeCurrentRules ? readRows<HierarchyRow>('the current Revenue Team hierarchy', (from, to) =>
      supabase.from('comm_hierarchy').select('staff_id, upline_staff_id, rate_mode, title_id, comm_ranks (rank_key)')
        .eq('scheme_id', scheme.id).lte('effective_from', currentDate)
        .or(`effective_to.is.null,effective_to.gte.${currentDate}`).order('id').range(from, to)) : Promise.resolve<HierarchyRow[]>([]),
    options.includeCurrentRules ? readRows<KpiItemRow>('current KPI items', (from, to) =>
      supabase.from('comm_kpi_items').select(KPI_ITEM_COLUMNS)
        .eq('scheme_id', scheme.id).lte('effective_from', currentDate)
        .or(`effective_to.is.null,effective_to.gte.${currentDate}`).order('id').range(from, to)) : Promise.resolve<KpiItemRow[]>([]),
    options.includeCurrentRules ? readRows<KpiThresholdRow>('current KPI thresholds', (from, to) =>
      supabase.from('comm_kpi_thresholds').select('min_qty, bonus_pct')
        .eq('scheme_id', scheme.id).lte('effective_from', currentDate)
        .or(`effective_to.is.null,effective_to.gte.${currentDate}`).order('id').range(from, to)) : Promise.resolve<KpiThresholdRow[]>([]),
    options.includeCurrentRules ? readRows<OpenBillRuleRow>('current Open Bill rules', (from, to) =>
      supabase.from('comm_open_bill_rules').select('bill_rank, pct')
        .eq('scheme_id', scheme.id).lte('effective_from', currentDate)
        .or(`effective_to.is.null,effective_to.gte.${currentDate}`).order('id').range(from, to)) : Promise.resolve<OpenBillRuleRow[]>([]),
    supabase.from('comm_cutovers').select('first_paid_month')
      .eq('sub_department_id', scheme.sub_department_id).maybeSingle()
      .then(({ data, error }: { data: unknown; error: { message: string } | null }) => {
        if (error) throw new Error(`Could not read when the portal starts paying: ${error.message}`)
        return (data as { first_paid_month: string } | null)?.first_paid_month ?? null
      }),
    // Open Bill may be set for this month alone, over Rules (2026-09-26:
    // on for August, which the claim form paid; September follows Rules).
    supabase.from('comm_open_bill_months').select('enabled')
      .eq('sub_department_id', scheme.sub_department_id).eq('period_month', period).maybeSingle()
      .then(({ data, error }: { data: unknown; error: { message: string } | null }) => {
        if (error) throw new Error(`Could not read this month's Open Bill setting: ${error.message}`)
        return (data as { enabled: boolean } | null)?.enabled ?? null
      }),
    // SKUs judged at their own cost ratio (Product List › Costing Setting).
    readRows<CostRatioRow>('the cost ratios', (from, to) =>
      supabase.from('comm_cost_ratios').select('product_code, ratio')
        .eq('scheme_id', scheme.id).order('erp_product_id').range(from, to)),
    // A Revenue Director's own bills earn nothing by rule (2026-09-27): the
    // engine must know them from somebody merely left off the team.
    readRows<{ id: string; title_id: string | null }>('who heads the department', (from, to) =>
      supabase.from('hr_staff_costs').select('id, title_id, titles!inner (is_department_head)')
        .eq('titles.is_department_head', true).order('id').range(from, to)),
    // Who directs this sub-department, and what Rules › Directors pays them
    // (2026-09-27).
    readRows<{ staff_id: string }>('the directors', (from, to) =>
      supabase.from('comm_sub_department_directors').select('staff_id')
        .eq('sub_department_id', scheme.sub_department_id).order('staff_id').range(from, to)),
    readRows<{ staff_id: string; fixed_amount: number | string; sales_threshold: number | string | null; incentive_amount: number | string }>(
      "the directors' pay", (from, to) =>
        supabase.from('comm_director_pay').select('staff_id, fixed_amount, sales_threshold, incentive_amount')
          .eq('scheme_id', scheme.id).order('staff_id').range(from, to)),
    // Who has been closed for which month: a bill of an earlier month is this
    // month's to pay only once its own month is closed for its salesperson.
    readRows<{ staff_id: string; period_month: string }>('the closes', (from, to) =>
      supabase.from('comm_salesperson_closes').select('staff_id, period_month')
        .eq('sub_department_id', scheme.sub_department_id).is('reopened_at', null).order('id').range(from, to)),
    readRows<{ period_month: string }>('the applied runs', (from, to) =>
      supabase.from('comm_runs').select('period_month')
        .eq('sub_department_id', scheme.sub_department_id).in('status', ['applied', 'locked']).order('id').range(from, to)),
  ])

  const releasedOrderNos = releases.filter(row => row.run_id !== options.replayRunId).map(row => row.order_no)
  const releasedSet = new Set(releasedOrderNos)
  // A month before the portal pays was settled by hand (comm_cutovers,
  // 2026-09-26): its bills never ride into a run — June to August 2026 would
  // otherwise all be paid again in September.
  const settledElsewhere = (order: SalesOrderRow) => cutover !== null && order.period_month < cutover
  // An earlier month's unpaid bill rides in only once that month is closed for
  // its salesperson (lib/commission/carry.ts, 2026-10-06): before, October's
  // page counted every September bill a second time while September was still
  // being closed. A replayed run still shows the earlier bills it paid.
  const paysHere = carriesInto(period, {
    closes: standingCloses.map(row => ({ staffId: row.staff_id, periodMonth: row.period_month })),
    appliedRuns: appliedRuns.map(row => row.period_month),
  })
  const paidByReplay = new Set(options.replayRunId ? releases.filter(row => row.run_id === options.replayRunId).map(row => row.order_no) : [])
  const carried = (order: SalesOrderRow) => paidByReplay.has(order.order_no) || paysHere({ staffId: order.staff_id, periodMonth: order.period_month })
  const orderRows = [...thisMonth, ...earlier.filter(order => !releasedSet.has(order.order_no) && !settledElsewhere(order) && carried(order))]
  const orderIds = orderRows.map(order => order.id)
  const lookBack = Math.max(0, ...ranks.map(rank => (rank.consecutive_months ?? 1) - 1))
  const priorPeriods = Array.from({ length: lookBack }, (_, index) => monthsBefore(period, index + 1))
  const [lines, openBillTags, shares, priorRuns] = await Promise.all([
    readByKeys<SalesLineRow & { order_id: string }>('sales order lines', orderIds, (chunk, from, to) =>
      supabase.from('sales_order_lines')
        .select('id, order_id, item_group, product_code, product_name, qty, line_amount, brand_code, cost_amount, option_charge_amount, description2, variants:raw->variants')
        .in('order_id', chunk).order('id').range(from, to)),
    readByKeys<OpenBillTagRow>('Open Bill picks', orderIds, (chunk, from, to) =>
      supabase.from('sales_order_open_bill_tags').select('order_id, bill_rank')
        .in('order_id', chunk).order('order_id').range(from, to)),
    readByKeys<OrderShareRow>('sales order shares', orderIds, (chunk, from, to) =>
      supabase.from('sales_order_shares').select('order_id, staff_id, share_pct')
        .in('order_id', chunk).order('order_id').order('staff_id').range(from, to)),
    readByKeys<{ id: string; period_month: string }>('earlier commission runs', priorPeriods, (chunk, from, to) =>
      supabase.from('comm_runs').select('id, period_month')
        .eq('sub_department_id', scheme.sub_department_id).in('period_month', chunk)
        .order('id').range(from, to)),
  ])

  const linesByOrder = new Map<string, SalesLineRow[]>()
  for (const line of lines) {
    const current = linesByOrder.get(line.order_id) ?? []
    current.push(line)
    linesByOrder.set(line.order_id, current)
  }
  for (const order of orderRows) order.sales_order_lines = linesByOrder.get(order.id) ?? []

  // Load statements directly: nested arrays have their own PostgREST row cap.
  type PriorStatementRow = NonNullable<PriorMonthRow['comm_statements']>[number] & { run_id: string }
  const priorStatements = await readByKeys<PriorStatementRow>(
    'earlier commission statements', priorRuns.map(run => run.id), (chunk, from, to) =>
      supabase.from('comm_statements').select('run_id, staff_id, product_revenue')
        .in('run_id', chunk).order('id').range(from, to),
  )
  const statementsByRun = new Map<string, PriorStatementRow[]>()
  for (const statement of priorStatements) {
    const current = statementsByRun.get(statement.run_id) ?? []
    current.push(statement)
    statementsByRun.set(statement.run_id, current)
  }
  const priorMonths: PriorMonthRow[] = priorRuns.map(run => ({
    period_month: run.period_month,
    comm_statements: statementsByRun.get(run.id) ?? [],
  }))

  // Revenue Directors (2026-09-27): the rank of their title's rung on this
  // ladder pays their own bills; the ones who direct this sub-department add
  // Rules › Directors' fixed amount and incentive. A head with neither is
  // left out — their bills earn nothing, as before.
  const rungByTitle = new Map(ranks.flatMap(rank => rank.title_id ? [[rank.title_id, rank.rank_key] as const] : []))
  const directing = new Set(directorRows.map(row => row.staff_id))
  const payByStaff = new Map(directorPayRows.map(row => [row.staff_id, row]))
  const directors: DirectorTerms[] = heads.flatMap(head => {
    const pay = directing.has(head.id) ? payByStaff.get(head.id) : undefined
    const terms: DirectorTerms = {
      staffId: head.id,
      rankKey: head.title_id ? rungByTitle.get(head.title_id) ?? null : null,
      fixedAmount: Number(pay?.fixed_amount ?? 0),
      salesThreshold: pay?.sales_threshold == null ? null : Number(pay.sales_threshold),
      incentiveAmount: Number(pay?.incentive_amount ?? 0),
    }
    return terms.rankKey !== null || terms.fixedAmount > 0 || terms.incentiveAmount > 0 ? [terms] : []
  })
  // The incentive's measure is Comm Cal's card, read the card's way.
  const monthValue = needsMonthValue(directors)
    ? monthCommissionableValue(options.monthOrders ?? await loadMonthOrders(supabase, scheme.sub_department_id, period))
    : undefined

  const schemeForMonth = openBillThisMonth === null ? scheme : { ...scheme, enable_open_bill: openBillThisMonth }
  const sourceRows = {
    periodMonth: period, scheme: schemeForMonth, ranks, itemGroups, kpiItems, kpiThresholds,
    openBillRules, openBillTags, marginBands, hierarchy, orders: orderRows,
    releasedOrderNos, priorMonths, shares, upsales, costRatios,
    departmentHeadIds: heads.map(head => head.id),
    directors,
    monthCommissionableValue: monthValue,
  }
  const currentInput = toEngineInput({
    ...sourceRows, hierarchy: currentHierarchyRows, kpiItems: currentKpiItems,
    kpiThresholds: currentKpiThresholds, openBillRules: currentOpenBillRules,
    orders: [], shares: [], upsales: [],
  })
  return {
    input: toEngineInput(sourceRows),
    currentHierarchy: currentInput.hierarchy,
    currentRules: {
      hierarchy: currentInput.hierarchy, kpiItems: currentInput.kpiItems,
      kpiThresholds: currentInput.kpiThresholds, openBillRules: currentInput.openBillRules,
    },
    batchId,
    schemeId: scheme.id,
    subDepartmentId: scheme.sub_department_id,
    unmatchedOrderNos: [...new Set(orderRows.filter(order => order.staff_id === null).map(order => order.order_no))],
  }
}
