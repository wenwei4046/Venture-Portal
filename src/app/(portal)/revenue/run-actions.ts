'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { computeCommissionRun as runEngine, monthsBefore } from '@/lib/commission/engine'
import { toEngineInput, toRunPayload } from '@/lib/commission/run-payload'
import { fetchByKeys } from '@/lib/paginate'
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
  SalesOrderRow,
  SchemeRow,
} from '@/lib/commission/run-payload'
import type { UpsaleRow } from '@/lib/commission/upsales'

/**
 * Computing a month's commission and syncing its clean result to payroll.
 *
 * The shape here follows the hybrid pattern the user chose for the salary
 * engine: the arithmetic is TypeScript (`src/lib/commission/engine.ts`, tested
 * against hand-worked examples), the WRITE is a single SQL function so a
 * half-written run is impossible. This file is the courier between them and
 * does no maths of its own beyond picking which rows to load.
 *
 * comm_* / sales_* postdate database.types.ts — untyped-client convention.
 */
async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

function rows<T>(data: unknown): T[] {
  return (data ?? []) as T[]
}

/** Last day of the period, as YYYY-MM-DD. Effective-dated config is read as at
 *  this date, so recomputing an old month uses that month's rules. */
function periodEnd(period: string): string {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 0))
  return d.toISOString().slice(0, 10)
}

function assertPeriod(period: string): void {
  if (!/^\d{4}-\d{2}-01$/.test(period)) {
    throw new Error('Period must be the first of a month, e.g. 2026-07-01')
  }
}

export interface ComputeSummary {
  runId: string
  periodMonth: string
  staffCount: number
  totalCommission: number
  warnings: string[]
  deferredCount: number
  penalisedCount: number
  releasedCount: number
  payrollSynced: boolean
}

/**
 * Compute the month from sales orders. The save RPC also syncs a clean run to
 * payroll, releases its orders and raises earned titles in the same transaction.
 * A run with warnings remains computed until its inputs are corrected.
 */
export async function computeRun(period: string, subDepartmentId?: string): Promise<ComputeSummary> {
  await requirePermission('revenue')
  assertPeriod(period)
  const supabase = await client()
  const asAt = periodEnd(period)

  // ── The scheme ─────────────────────────────────────────────────────────
  const { data: schemeRows, error: schemeError } = await supabase
    .from('comm_schemes')
    .select(
      'id, sub_department_id, open_bill_basis, override_includes_kpi, deposit_threshold_pct, default_rate_mode, enable_product_revenue, enable_kpi, enable_open_bill, enable_override, enable_margin_penalty, enable_margin_incentive, enable_group_incentive, group_sales_depth, override_depth, revenue_cost_divisor',
    )
    .eq('is_active', true)
    .is('effective_to', null)
  if (schemeError) throw new Error(`Could not read the commission scheme: ${schemeError.message}`)

  const schemes = rows<SchemeRow>(schemeRows)
  if (schemes.length === 0) {
    throw new Error('No active commission scheme. Set one up under Revenue → Rules first.')
  }

  const scheme = subDepartmentId
    ? schemes.find(s => s.sub_department_id === subDepartmentId)
    : schemes.length === 1
      ? schemes[0]
      : undefined
  if (!scheme) {
    throw new Error(
      subDepartmentId
        ? 'That sub-department has no active commission scheme.'
        : 'There is more than one sub-department — say which one to run.',
    )
  }

  // ── The month's imported sales ─────────────────────────────────────────
  const { data: batchRow } = await supabase
    .from('sales_import_batches')
    .select('id')
    .eq('sub_department_id', scheme.sub_department_id)
    .eq('period_month', period)
    .eq('status', 'committed')
    .maybeSingle()
  const batchId = (batchRow as { id: string } | null)?.id ?? null
  if (!batchId) {
    throw new Error(`Nothing has been imported for ${period.slice(0, 7)} yet.`)
  }

  const orderSelect =
    'id, order_no, staff_id, order_date, event_date, period_month, order_total, paid_amount, manual_margin_pct, sales_order_lines (id, item_group, product_code, product_name, qty, line_amount, brand_code, cost_amount)'

  // Carry-forward. An order the deposit gate held in an earlier month belongs
  // in this run once the customer has topped up, so the input is not just this
  // month's batch: it is every committed order up to and including this month
  // that no applied run has paid for yet.
  const [{ data: thisMonth, error: orderError }, { data: releases }] = await Promise.all([
    supabase.from('sales_orders').select(orderSelect).eq('batch_id', batchId).eq('cancelled', false),
    supabase.from('comm_order_releases').select('order_no').eq('sub_department_id', scheme.sub_department_id),
  ])
  if (orderError) throw new Error(`Could not read the sales orders: ${orderError.message}`)

  const releasedOrderNos = rows<{ order_no: string }>(releases).map(r => r.order_no)

  const { data: earlier, error: earlierError } = await supabase
    .from('sales_orders')
    .select(`${orderSelect}, sales_import_batches!inner (status, sub_department_id)`)
    .lt('period_month', period)
    .eq('cancelled', false)
    .eq('sales_import_batches.status', 'committed')
    .eq('sales_import_batches.sub_department_id', scheme.sub_department_id)
  if (earlierError) throw new Error(`Could not read carried-forward orders: ${earlierError.message}`)

  const releasedSet = new Set(releasedOrderNos)
  const carried = rows<SalesOrderRow>(earlier).filter(o => !releasedSet.has(o.order_no))
  const orderRows = [...rows<SalesOrderRow>(thisMonth), ...carried]

  // ── Configuration, read as at the period being computed ────────────────
  const [
    ranks,
    itemGroups,
    kpiItems,
    kpiThresholds,
    openBillRules,
    marginBands,
    hierarchy,
  ] = await Promise.all([
    supabase
      .from('comm_ranks')
      .select('rank_key, title_id, titles (name), label, product_rate, group_incentive_amount, group_subsidy_cap, can_recruit, group_sales_threshold, personal_sales_threshold, consecutive_months, sort_order')
      .eq('scheme_id', scheme.id)
      .order('sort_order'),
    supabase
      .from('comm_item_groups')
      .select('item_group, commissionable')
      .eq('scheme_id', scheme.id),
    supabase
      .from('comm_kpi_items')
      .select('product_code, kpi_amount')
      .eq('scheme_id', scheme.id)
      .lte('effective_from', asAt)
      .or(`effective_to.is.null,effective_to.gte.${asAt}`),
    supabase
      .from('comm_kpi_thresholds')
      .select('min_qty, bonus_pct')
      .eq('scheme_id', scheme.id)
      .lte('effective_from', asAt)
      .or(`effective_to.is.null,effective_to.gte.${asAt}`),
    supabase
      .from('comm_open_bill_rules')
      .select('bill_rank, pct')
      .eq('scheme_id', scheme.id)
      .lte('effective_from', asAt)
      .or(`effective_to.is.null,effective_to.gte.${asAt}`),
    supabase
      .from('comm_margin_bands')
      .select('band_key, label, kind, margin_pct, commission_multiplier, monthly_incentive, comm_brands (code)')
      .eq('scheme_id', scheme.id)
      .order('sort_order'),
    // The title they hold HERE rides along: it decides who may recruit and
    // whether this month's rank would raise it (the ratchet — titles.ts). It
    // is the membership's own title since 2026-09-10, not the company one.
    supabase
      .from('comm_hierarchy')
      .select('staff_id, upline_staff_id, rate_mode, title_id, comm_ranks (rank_key)')
      .eq('scheme_id', scheme.id)
      .lte('effective_from', asAt)
      .or(`effective_to.is.null,effective_to.gte.${asAt}`),
  ])

  // Open Bill picks only for the orders actually in this run — CHUNKED.
  //
  // The run's orders are this month's PLUS everything carried forward, which
  // is hundreds of ids, and PostgREST takes its filters in the query string.
  // Asked for 507 of them at once the request fails outright (`TypeError:
  // fetch failed`), and this used not to read the error: the run then paid no
  // Open Bill bonus to anybody and said nothing about it. September 2026 lost
  // RM 18,677 that way before it was caught.
  const orderIds = orderRows.map(o => o.id)
  const tagRows = await fetchByKeys<OpenBillTagRow, string>(orderIds, chunk =>
    supabase.from('sales_order_open_bill_tags').select('order_id, bill_rank').in('order_id', chunk),
  )

  // Who else each bill is shared with (2026-09-24). Chunked for the same reason
  // as the picks above; a shared bill reaches the engine as one part per holder.
  const shareRows = await fetchByKeys<OrderShareRow, string>(orderIds, chunk =>
    supabase.from('sales_order_shares').select('order_id, staff_id, share_pct').in('order_id', chunk),
  )

  // Upsales HR recorded under this month (2026-09-24): amounts customers added
  // to earlier orders. Read by month and never carried — `lib/commission/upsales.ts`.
  const { data: upsaleRows, error: upsaleError } = await supabase
    .from('comm_upsales')
    .select('id, staff_id, amount, sold_on, original_ref')
    .eq('sub_department_id', scheme.sub_department_id)
    .eq('period_month', period)
  if (upsaleError) throw new Error(`Could not read the month's upsales: ${upsaleError.message}`)

  // ── The months before, for the streak gates ────────────────────────────
  // A rung with `personal_sales_threshold` × N months looks back N − 1 months
  // at what those months' runs paid as own revenue. Only months that were
  // run are passed: an unrun month is unknown, not zero, and the engine will
  // not let a streak cross it.
  const rankRows = rows<RankRow>(ranks.data)
  const lookBack = Math.max(0, ...rankRows.map(r => (r.consecutive_months ?? 1) - 1))
  const priorPeriods = Array.from({ length: lookBack }, (_, i) => monthsBefore(period, i + 1))
  const { data: priorRows, error: priorError } =
    priorPeriods.length > 0
      ? await supabase
          .from('comm_runs')
          .select('period_month, comm_statements (staff_id, product_revenue)')
          .eq('sub_department_id', scheme.sub_department_id)
          .in('period_month', priorPeriods)
      : { data: [], error: null }
  if (priorError) throw new Error(`Could not read the earlier months: ${priorError.message}`)

  // ── Run it ─────────────────────────────────────────────────────────────
  const input = toEngineInput({
    periodMonth: period,
    scheme,
    ranks: rankRows,
    itemGroups: rows<ItemGroupRow>(itemGroups.data),
    kpiItems: rows<KpiItemRow>(kpiItems.data),
    kpiThresholds: rows<KpiThresholdRow>(kpiThresholds.data),
    openBillRules: rows<OpenBillRuleRow>(openBillRules.data),
    openBillTags: tagRows,
    marginBands: rows<MarginBandRow>(marginBands.data),
    hierarchy: rows<HierarchyRow>(hierarchy.data),
    orders: orderRows,
    releasedOrderNos,
    priorMonths: rows<PriorMonthRow>(priorRows),
    shares: shareRows,
    upsales: rows<UpsaleRow>(upsaleRows),
  })

  const result = runEngine(input)
  const payload = toRunPayload(input, result)

  // An unmatched agent never reaches the engine (the order pays nobody), so
  // the run would look clean while quietly excluding real sales. Say so here.
  const unmatched = orderRows.filter(o => o.staff_id === null)
  if (unmatched.length > 0) {
    const names = [...new Set(unmatched.map(o => o.order_no))].length
    payload.p_warnings = [
      `${names} order(s) carry an agent who is not a salesperson in the portal and were excluded. Match them in the import wizard.`,
      ...payload.p_warnings,
    ]
  }

  const { data: runId, error: saveError } = await supabase.rpc('save_commission_run', {
    p_period_month: period,
    p_sub_department_id: scheme.sub_department_id,
    p_scheme_id: scheme.id,
    p_batch_id: batchId,
    p_total_commission: payload.p_total_commission,
    p_warnings: payload.p_warnings,
    p_statements: payload.p_statements,
    p_released_orders: payload.p_released_orders,
    p_deferred_orders: payload.p_deferred_orders,
    p_penalised_orders: payload.p_penalised_orders,
  })
  if (saveError) throw new Error(saveError.message)

  revalidatePath('/revenue', 'layout')
  revalidatePath('/hr-costing/payroll', 'layout')
  revalidatePath('/team', 'layout')

  return {
    runId: runId as string,
    periodMonth: period,
    staffCount: payload.p_statements.length,
    totalCommission: payload.p_total_commission,
    warnings: payload.p_warnings,
    deferredCount: payload.p_deferred_orders.length,
    penalisedCount: payload.p_penalised_orders.length,
    releasedCount: payload.p_released_orders.length,
    payrollSynced: payload.p_warnings.length === 0,
  }
}

/** Pull an applied run back to draft, undoing the payroll figures it wrote. */
export async function reopenRun(runId: string): Promise<void> {
  await requirePermission('revenue')
  const supabase = await client()

  const { error } = await supabase.rpc('reopen_commission_run', { p_run_id: runId })
  if (error) throw new Error(error.message)

  revalidatePath('/revenue', 'layout')
  revalidatePath('/hr-costing/payroll', 'layout')
}

// ─── Review-board edits ─────────────────────────────────────────────────────

/**
 * Set (or clear) which of the day's bills this order is for its salesperson.
 *
 * The importer seeds these from the running document number because the ERP
 * carries no time of day; a human confirming or moving one clears
 * `auto_suggested`, which is how the board shows what has been reviewed.
 *
 * A rank is held by one order per person per day, so claiming a taken rank
 * moves it — refusing would make the board unusable, since correcting a
 * suggestion almost always means swapping two orders.
 */
export async function setOpenBillRank(orderId: string, rank: 1 | 2 | 3 | null): Promise<void> {
  const user = await requirePermission('revenue')
  const supabase = await client()

  const { data: orderRow } = await supabase
    .from('sales_orders')
    .select('id, staff_id, event_date, period_month, sales_import_batches!inner (sub_department_id)')
    .eq('id', orderId)
    .maybeSingle()
  const order = orderRow as {
    staff_id: string | null
    event_date: string
    period_month: string
    sales_import_batches: { sub_department_id: string }
  } | null
  if (!order) throw new Error('Order not found')
  if (!order.staff_id) throw new Error('That order has no matched salesperson yet.')

  await assertRunOpen(supabase, order.period_month, order.sales_import_batches.sub_department_id)

  if (rank === null) {
    const { error } = await supabase.from('sales_order_open_bill_tags').delete().eq('order_id', orderId)
    if (error) throw new Error(error.message)
  } else {
    // Free the rank if another of that person's orders holds it that day.
    const { error: freeError } = await supabase
      .from('sales_order_open_bill_tags')
      .delete()
      .eq('sub_department_id', order.sales_import_batches.sub_department_id)
      .eq('staff_id', order.staff_id)
      .eq('event_date', order.event_date)
      .eq('bill_rank', rank)
    if (freeError) throw new Error(freeError.message)

    const { error } = await supabase.from('sales_order_open_bill_tags').upsert(
      {
        order_id: orderId,
        staff_id: order.staff_id,
        event_date: order.event_date,
        bill_rank: rank,
        auto_suggested: false,
        tagged_by: user.id,
        tagged_at: new Date().toISOString(),
      },
      { onConflict: 'order_id' },
    )
    if (error) throw new Error(error.message)
  }

  revalidatePath('/revenue', 'layout')
}

/**
 * Share a bill with another team member (2026-09-24). Default 50/50: the owner
 * keeps 1 − Σ(shares). Each part is paid at its holder's own rate and climbs
 * its holder's own upline line — `lib/commission/shares.ts`. Sharing again with
 * the same person changes their part. The table refuses a share with the owner,
 * shares that leave the owner nothing (23SHR) and a paid month (23RUN).
 */
export async function shareOrder(orderId: string, staffId: string, pct = 0.5): Promise<void> {
  await requirePermission('revenue')
  if (!(pct > 0 && pct < 1)) throw new Error('A share is more than 0% and less than 100% of the bill')
  const supabase = await client()

  const { data: orderRow } = await supabase
    .from('sales_orders')
    .select('id, staff_id, period_month, sales_import_batches!inner (sub_department_id)')
    .eq('id', orderId)
    .maybeSingle()
  const order = orderRow as {
    staff_id: string | null
    period_month: string
    sales_import_batches: { sub_department_id: string }
  } | null
  if (!order) throw new Error('Order not found')
  if (!order.staff_id) throw new Error('Match this bill to a salesperson before sharing it.')
  if (order.staff_id === staffId) throw new Error('That is who the bill already belongs to.')

  await assertRunOpen(supabase, order.period_month, order.sales_import_batches.sub_department_id)

  const { error } = await supabase
    .from('sales_order_shares')
    .upsert({ order_id: orderId, staff_id: staffId, share_pct: Math.round(pct * 10_000) / 10_000 }, { onConflict: 'order_id,staff_id' })
  if (error) throw new Error(error.message)

  revalidatePath('/revenue', 'layout')
}

/** Take a share back: the owner holds that part again. */
export async function unshareOrder(orderId: string, staffId: string): Promise<void> {
  await requirePermission('revenue')
  const supabase = await client()
  const { error } = await supabase.from('sales_order_shares').delete().eq('order_id', orderId).eq('staff_id', staffId)
  if (error) throw new Error(error.message)
  revalidatePath('/revenue', 'layout')
}

/**
 * Key a bill's margin by hand. The stop-gap while the Product List fills up:
 * it OVERRIDES anything derived from line costs, so a human correction always
 * wins. Passing null hands the bill back to its costs.
 */
export async function setManualMargin(orderId: string, marginPct: number | null): Promise<void> {
  const user = await requirePermission('revenue')
  const supabase = await client()

  if (marginPct !== null && (marginPct < -1 || marginPct > 1)) {
    throw new Error('Margin must be between -100% and 100%')
  }

  const { data: orderRow } = await supabase
    .from('sales_orders')
    .select('period_month, sales_import_batches!inner (sub_department_id)')
    .eq('id', orderId)
    .maybeSingle()
  const order = orderRow as { period_month: string; sales_import_batches: { sub_department_id: string } } | null
  if (!order) throw new Error('Order not found')

  await assertRunOpen(supabase, order.period_month, order.sales_import_batches.sub_department_id)

  const { error } = await supabase
    .from('sales_orders')
    .update({
      manual_margin_pct: marginPct,
      manual_margin_by: marginPct === null ? null : user.id,
      manual_margin_at: marginPct === null ? null : new Date().toISOString(),
    })
    .eq('id', orderId)
  if (error) throw new Error(error.message)

  revalidatePath('/revenue', 'layout')
}

/**
 * Editing what a run was computed from, after it has paid, would leave the
 * statements describing sales that no longer exist. The run has to be reopened
 * first — which puts the money back before the inputs move.
 */
async function assertRunOpen(supabase: SupabaseClient, periodMonth: string, subDepartmentId: string): Promise<void> {
  const { data: locked, error } = await supabase.rpc('commission_order_period_locked', {
    p_sub_department_id: subDepartmentId,
    p_period: periodMonth,
  })
  if (error) throw new Error(`Could not check the commission run: ${error.message}`)
  if (locked) {
    throw new Error(
      `These ${periodMonth.slice(0, 7)} sales have an applied or locked commission run. Reopen the run that paid them before making changes.`,
    )
  }
}

// ─── Costs ──────────────────────────────────────────────────────────────────

export interface RecostResult {
  linesCosted: number
  linesStillBlind: number
  ordersFullyCosted: number
}

/**
 * Re-price a month's lines from the Product List.
 *
 * Since 2026-09-24 every line is costed at the portal's own price (user:
 * margin 统一由产品这边的价格来计算) — a SKU's figure, a sofa module's cell at
 * the line's seat height and fabric tier, each option's surcharge, and a sofa
 * build's combo — never the ERP's own costing. New deliveries are priced on
 * arrival by a database trigger. This is for the months that already landed:
 * the same pricing, re-applied to every line of the month, so a price keyed or
 * corrected on the Product List reaches bills sold before it. The RPC refuses a
 * month whose run has paid.
 *
 * A COST CHANGES WHAT THE MONTH PAYS — it moves the margin, the margin moves
 * the band, and the band moves the commission — so the run has to be computed
 * again afterwards. The page that calls this says so; it does not recompute on
 * anybody's behalf.
 */
export async function recostMonth(subDepartmentId: string, period: string): Promise<RecostResult> {
  await requirePermission('revenue')
  const supabase = await client()

  const { data, error } = await supabase.rpc('recost_sales_order_lines', {
    p_sub_department_id: subDepartmentId,
    p_period: period,
  })
  if (error) throw new Error(`Could not refill the costs: ${error.message}`)

  const row = (Array.isArray(data) ? data[0] : data) as
    | { lines_costed: number; lines_still_blind: number; orders_with_cost: number }
    | undefined

  revalidatePath('/revenue', 'layout')
  return {
    linesCosted: row?.lines_costed ?? 0,
    linesStillBlind: row?.lines_still_blind ?? 0,
    ordersFullyCosted: row?.orders_with_cost ?? 0,
  }
}
