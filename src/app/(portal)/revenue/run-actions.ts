'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { computeCommissionRun as runEngine } from '@/lib/commission/engine'
import { toEngineInput, toRunPayload } from '@/lib/commission/run-payload'
import type {
  HierarchyRow,
  ItemGroupRow,
  KpiItemRow,
  KpiThresholdRow,
  MarginBandRow,
  OpenBillRuleRow,
  OpenBillTagRow,
  RankRow,
  SalesOrderRow,
  SchemeRow,
} from '@/lib/commission/run-payload'

/**
 * Computing and applying a month's commission.
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
}

/**
 * Recompute the month from the imported sales orders and store the result as a
 * draft the human reviews. Nothing reaches payroll until Apply.
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
      'id, sub_department_id, open_bill_basis, override_includes_kpi, deposit_threshold_pct, default_rate_mode, enable_product_revenue, enable_kpi, enable_open_bill, enable_override, enable_margin_penalty, enable_margin_incentive',
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
    supabase.from('comm_order_releases').select('order_no'),
  ])
  if (orderError) throw new Error(`Could not read the sales orders: ${orderError.message}`)

  const releasedOrderNos = rows<{ order_no: string }>(releases).map(r => r.order_no)

  const { data: earlier, error: earlierError } = await supabase
    .from('sales_orders')
    .select(`${orderSelect}, sales_import_batches!inner (status)`)
    .lt('period_month', period)
    .eq('cancelled', false)
    .eq('sales_import_batches.status', 'committed')
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
      .select('rank_key, title_id, titles (name), label, product_rate, can_recruit, group_sales_threshold, sort_order')
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
    // The title they HOLD rides along: it decides who may recruit and whether
    // this month's rank would raise it (the ratchet — titles.ts).
    supabase
      .from('comm_hierarchy')
      .select('staff_id, upline_staff_id, rate_mode, comm_ranks (rank_key), hr_staff_costs!comm_hierarchy_staff_id_fkey (title_id)')
      .eq('scheme_id', scheme.id)
      .lte('effective_from', asAt)
      .or(`effective_to.is.null,effective_to.gte.${asAt}`),
  ])

  // Open Bill picks only for the orders actually in this run.
  const orderIds = orderRows.map(o => o.id)
  const { data: tagRows } =
    orderIds.length > 0
      ? await supabase
          .from('sales_order_open_bill_tags')
          .select('order_id, bill_rank')
          .in('order_id', orderIds)
      : { data: [] }

  // ── Run it ─────────────────────────────────────────────────────────────
  const input = toEngineInput({
    periodMonth: period,
    scheme,
    ranks: rows<RankRow>(ranks.data),
    itemGroups: rows<ItemGroupRow>(itemGroups.data),
    kpiItems: rows<KpiItemRow>(kpiItems.data),
    kpiThresholds: rows<KpiThresholdRow>(kpiThresholds.data),
    openBillRules: rows<OpenBillRuleRow>(openBillRules.data),
    openBillTags: rows<OpenBillTagRow>(tagRows),
    marginBands: rows<MarginBandRow>(marginBands.data),
    hierarchy: rows<HierarchyRow>(hierarchy.data),
    orders: orderRows,
    releasedOrderNos,
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

  return {
    runId: runId as string,
    periodMonth: period,
    staffCount: payload.p_statements.length,
    totalCommission: payload.p_total_commission,
    warnings: payload.p_warnings,
    deferredCount: payload.p_deferred_orders.length,
    penalisedCount: payload.p_penalised_orders.length,
    releasedCount: payload.p_released_orders.length,
  }
}

export interface ApplySummary {
  staffWritten: number
  ordersReleased: number
  /** Titles the ratchet raised this apply — never lowered, never undone by reopen. */
  titlesPromoted: number
  totalCommission: number
}

/**
 * Write the computed run into `hr_monthly_payroll.commission_amount`, and
 * raise the title of anyone paid a rank above the title they hold.
 * The RPC does the checking: no outstanding warnings, payroll still draft,
 * no order another run has already paid.
 */
export async function applyRun(runId: string): Promise<ApplySummary> {
  await requirePermission('revenue')
  const supabase = await client()

  const { data, error } = await supabase.rpc('apply_commission_run', { p_run_id: runId })
  if (error) throw new Error(error.message)

  revalidatePath('/revenue', 'layout')
  revalidatePath('/hr-costing/payroll', 'layout')
  // A raised title shows on the People roster too.
  revalidatePath('/team', 'layout')

  const out = data as {
    staff_written: number
    orders_released: number
    titles_promoted: number
    total_commission: number
  }
  return {
    staffWritten: out.staff_written,
    ordersReleased: out.orders_released,
    titlesPromoted: out.titles_promoted ?? 0,
    totalCommission: Number(out.total_commission),
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
    .select('id, staff_id, event_date, period_month')
    .eq('id', orderId)
    .maybeSingle()
  const order = orderRow as {
    staff_id: string | null
    event_date: string
    period_month: string
  } | null
  if (!order) throw new Error('Order not found')
  if (!order.staff_id) throw new Error('That order has no matched salesperson yet.')

  await assertRunOpen(supabase, order.period_month)

  if (rank === null) {
    const { error } = await supabase.from('sales_order_open_bill_tags').delete().eq('order_id', orderId)
    if (error) throw new Error(error.message)
  } else {
    // Free the rank if another of that person's orders holds it that day.
    const { error: freeError } = await supabase
      .from('sales_order_open_bill_tags')
      .delete()
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
    .select('period_month')
    .eq('id', orderId)
    .maybeSingle()
  const order = orderRow as { period_month: string } | null
  if (!order) throw new Error('Order not found')

  await assertRunOpen(supabase, order.period_month)

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
async function assertRunOpen(supabase: SupabaseClient, periodMonth: string): Promise<void> {
  // One run per sub-department per month, so a period can carry several rows.
  // Any settled one is enough to refuse: the order could belong to it.
  const { data } = await supabase
    .from('comm_runs')
    .select('status')
    .eq('period_month', periodMonth)
    .in('status', ['applied', 'locked'])
    .limit(1)
  const status = ((data ?? []) as Array<{ status: string }>)[0]?.status
  if (status) {
    throw new Error(
      `The ${periodMonth.slice(0, 7)} run is already ${status} — reopen it before changing what it was computed from.`,
    )
  }
}
