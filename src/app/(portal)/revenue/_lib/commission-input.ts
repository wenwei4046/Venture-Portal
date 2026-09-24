import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows, fetchByKeys } from '@/lib/paginate'
import { monthsBefore } from '@/lib/commission/engine'
import { toEngineInput } from '@/lib/commission/run-payload'
import type {
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
import type { EngineInput } from '@/lib/commission/types'
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
  const currentDate = new Date().toISOString().slice(0, 10)
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

  if (options.replayRunId) {
    const { data, error } = await supabase.from('comm_runs').select('id')
      .eq('id', options.replayRunId).eq('period_month', period)
      .eq('sub_department_id', scheme.sub_department_id).maybeSingle()
    if (error) throw new Error(`Could not read the commission run: ${error.message}`)
    if (!data) throw new Error('The commission run does not belong to this month and sub-department.')
  }

  const { data: batchRow, error: batchError } = await supabase.from('sales_import_batches')
    .select('id').eq('sub_department_id', scheme.sub_department_id)
    .eq('period_month', period).eq('status', 'committed').maybeSingle()
  if (batchError) throw new Error(`Could not read the month's import: ${batchError.message}`)
  const batchId = (batchRow as { id: string } | null)?.id
  if (!batchId) throw new Error(`Nothing has been imported for ${period.slice(0, 7)} yet.`)

  const orderSelect = 'id, order_no, staff_id, order_date, event_date, period_month, order_total, paid_amount, manual_margin_pct'
  const [thisMonth, earlier, releases, ranks, itemGroups, kpiItems, kpiThresholds,
    openBillRules, marginBands, hierarchy, upsales, currentHierarchyRows,
    currentKpiItems, currentKpiThresholds, currentOpenBillRules] = await Promise.all([
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
      supabase.from('comm_kpi_items').select('product_code, kpi_amount')
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
    readRows<UpsaleRow>("the month's upsales", (from, to) =>
      supabase.from('comm_upsales').select('id, staff_id, amount, sold_on, original_ref')
        .eq('sub_department_id', scheme.sub_department_id).eq('period_month', period)
        .order('id').range(from, to)),
    options.includeCurrentRules ? readRows<HierarchyRow>('the current Revenue Team hierarchy', (from, to) =>
      supabase.from('comm_hierarchy').select('staff_id, upline_staff_id, rate_mode, title_id, comm_ranks (rank_key)')
        .eq('scheme_id', scheme.id).lte('effective_from', currentDate)
        .or(`effective_to.is.null,effective_to.gte.${currentDate}`).order('id').range(from, to)) : Promise.resolve<HierarchyRow[]>([]),
    options.includeCurrentRules ? readRows<KpiItemRow>('current KPI items', (from, to) =>
      supabase.from('comm_kpi_items').select('product_code, kpi_amount')
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
  ])

  const releasedOrderNos = releases.filter(row => row.run_id !== options.replayRunId).map(row => row.order_no)
  const releasedSet = new Set(releasedOrderNos)
  const orderRows = [...thisMonth, ...earlier.filter(order => !releasedSet.has(order.order_no))]
  const orderIds = orderRows.map(order => order.id)
  const lookBack = Math.max(0, ...ranks.map(rank => (rank.consecutive_months ?? 1) - 1))
  const priorPeriods = Array.from({ length: lookBack }, (_, index) => monthsBefore(period, index + 1))
  const [lines, openBillTags, shares, priorRuns] = await Promise.all([
    readByKeys<SalesLineRow & { order_id: string }>('sales order lines', orderIds, (chunk, from, to) =>
      supabase.from('sales_order_lines')
        .select('id, order_id, item_group, product_code, product_name, qty, line_amount, brand_code, cost_amount')
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

  const sourceRows = {
    periodMonth: period, scheme, ranks, itemGroups, kpiItems, kpiThresholds,
    openBillRules, openBillTags, marginBands, hierarchy, orders: orderRows,
    releasedOrderNos, priorMonths, shares, upsales,
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
