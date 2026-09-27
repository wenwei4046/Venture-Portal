'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { openBillOnFor } from './_lib/open-bill-month'
import { assertBillsNotClosed } from './_lib/salesperson-closes'
import { fetchByKeys } from '@/lib/paginate'

/**
 * What a commission month's people change by hand: Open Bill picks, shares,
 * bills that do not count, keyed margins, a month's costs. Every write is one
 * SQL function or a guarded row write; none of them does commission maths.
 *
 * Sending to payroll is not here any more (2026-09-27): the whole-month send
 * went the day it came — the user's Send is per salesperson (Send = Complete),
 * which is the per-person close's job.
 *
 * comm_* / sales_* postdate database.types.ts — untyped-client convention.
 */
async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

// ─── Review-board edits ─────────────────────────────────────────────────────

type BillRank = 1 | 2 | 3
interface OpenBillOrder {
  id: string
  staff_id: string | null
  event_date: string
  period_month: string
  cancelled: boolean
  sales_import_batches: { sub_department_id: string } | { sub_department_id: string }[]
}

export interface OpenBillPickChange {
  orderId: string
  before: BillRank | null
  after: BillRank | null
}

function assertBillRank(rank: unknown): asserts rank is BillRank | null {
  if (rank !== null && rank !== 1 && rank !== 2 && rank !== 3) {
    throw new Error('Open Bill rank must be 1, 2, 3, or empty.')
  }
}

function openBillSub(order: OpenBillOrder): string {
  const batch = Array.isArray(order.sales_import_batches) ? order.sales_import_batches[0] : order.sales_import_batches
  if (!batch?.sub_department_id) throw new Error('The sales order has no sub-department.')
  return batch.sub_department_id
}

async function readOpenBillOrders(supabase: SupabaseClient, ids: readonly string[]): Promise<OpenBillOrder[]> {
  return fetchByKeys<OpenBillOrder, string>(ids, chunk => supabase.from('sales_orders')
    .select('id, staff_id, event_date, period_month, cancelled, sales_import_batches!inner (sub_department_id)')
    .in('id', chunk) as unknown as PromiseLike<{ data: OpenBillOrder[] | null; error: { message: string } | null }>)
}

/**
 * Picks are taken only in a month Open Bill pays in: the month's own setting,
 * else Rules (2026-09-26, `comm_open_bill_on` — the rule the database asks).
 */
async function assertOpenBillEnabled(supabase: SupabaseClient, subDepartmentId: string, period: string): Promise<void> {
  if (!(await openBillOnFor(supabase, subDepartmentId, period))) {
    throw new Error(`Open Bill is switched off for ${period.slice(0, 7)}. Preview settings do not enable saving picks. No picks were changed by this check.`)
  }
}

/**
 * Validate the whole draft BEFORE freeing any rank. This prevents a stale
 * browser, a disabled source switch or a locked carried month from leaving a
 * half-cleared allocation. The subsequent REST writes are not a transaction;
 * failures are reported as partial and every single edit rechecks its locks.
 */
export async function saveOpenBillPicks(changes: OpenBillPickChange[]): Promise<void> {
  await requirePermission('revenue')
  if (!Array.isArray(changes)) throw new Error('Open Bill changes must be a list.')
  const ids = new Set<string>()
  for (const change of changes) {
    if (!change || typeof change.orderId !== 'string' || !change.orderId || ids.has(change.orderId)) {
      throw new Error('Every Open Bill change must name a different sales order.')
    }
    assertBillRank(change.before)
    assertBillRank(change.after)
    ids.add(change.orderId)
  }
  const edits = changes.filter(change => change.before !== change.after)
  if (edits.length === 0) return
  const changedIds = new Set(edits.map(change => change.orderId))
  const supabase = await client()
  const orders = await readOpenBillOrders(supabase, edits.map(change => change.orderId))
  if (orders.length !== edits.length) throw new Error('An Open Bill order is no longer available. Refresh before saving.')
  const byOrder = new Map(orders.map(order => [order.id, order]))
  const groups = new Map<string, { sub: string; staffId: string; eventDate: string }>()
  const periods = new Map<string, { sub: string; period: string }>()
  const desiredSlots = new Map<string, string>()
  for (const change of edits) {
    const order = byOrder.get(change.orderId)!
    if (!order.staff_id) throw new Error('An Open Bill order no longer has a matched salesperson. Refresh before saving.')
    if (order.cancelled && change.after !== null) throw new Error('An excluded sales order cannot receive an Open Bill pick.')
    const sub = openBillSub(order)
    const groupKey = JSON.stringify([sub, order.staff_id, order.event_date])
    groups.set(groupKey, { sub, staffId: order.staff_id, eventDate: order.event_date })
    periods.set(JSON.stringify([sub, order.period_month]), { sub, period: order.period_month })
    if (change.after !== null) {
      const slot = JSON.stringify([sub, order.staff_id, order.event_date, change.after])
      if (desiredSlots.has(slot)) throw new Error('Two orders cannot hold the same Open Bill rank for one salesperson and event day.')
      desiredSlots.set(slot, order.id)
    }
  }
  await Promise.all([
    ...[...periods.values()].map(({ sub, period }) => assertOpenBillEnabled(supabase, sub, period)),
    ...[...periods.values()].map(({ sub, period }) => assertRunOpen(supabase, period, sub)),
    assertBillsNotClosed(supabase, [...changedIds]),
  ])
  const tagGroups = await Promise.all([...groups.values()].map(async group => {
    const { data, error } = await supabase.from('sales_order_open_bill_tags').select('order_id, bill_rank')
      .eq('sub_department_id', group.sub).eq('staff_id', group.staffId).eq('event_date', group.eventDate)
    if (error) throw new Error(`Could not read the current Open Bill picks: ${error.message}`)
    return { group, tags: (data ?? []) as { order_id: string; bill_rank: BillRank }[] }
  }))
  const current = new Map(tagGroups.flatMap(({ tags }) => tags.map(tag => [tag.order_id, tag.bill_rank] as const)))
  for (const change of edits) {
    if ((current.get(change.orderId) ?? null) !== change.before) {
      throw new Error('Open Bill picks changed since this page loaded. Refresh before saving; no picks were changed.')
    }
  }
  const conflicts = tagGroups.flatMap(({ group, tags }) => tags.filter(tag => {
    const target = desiredSlots.get(JSON.stringify([group.sub, group.staffId, group.eventDate, tag.bill_rank]))
    return target && target !== tag.order_id && !changedIds.has(tag.order_id)
  }))
  if (conflicts.length > 0) {
    const conflictOrders = await readOpenBillOrders(supabase, conflicts.map(tag => tag.order_id))
    if (conflictOrders.length !== conflicts.length) throw new Error('An occupied Open Bill rank could not be checked. Refresh before saving.')
    await Promise.all(conflictOrders.map(order => assertRunOpen(supabase, order.period_month, openBillSub(order))))
    throw new Error('Another order now holds an Open Bill rank in this draft. Refresh and review that order before saving; no picks were changed.')
  }

  let completed = 0
  try {
    for (const change of edits) if (change.before !== null) { await writeOpenBillRank(change.orderId, null, false, change.before); completed++ }
    for (const change of edits) if (change.after !== null) { await writeOpenBillRank(change.orderId, change.after, false, null); completed++ }
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : 'Could not save Open Bill picks.'} ${completed > 0 ? 'Some picks were saved. ' : ''}Refresh before retrying.`)
  } finally {
    revalidatePath('/revenue', 'layout')
  }
}

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
  await writeOpenBillRank(orderId, rank, true)
}

async function writeOpenBillRank(orderId: string, rank: BillRank | null, allowMove: boolean, expectedRank?: BillRank | null): Promise<void> {
  const user = await requirePermission('revenue')
  assertBillRank(rank)
  const supabase = await client()
  const [order] = await readOpenBillOrders(supabase, [orderId])
  if (!order) throw new Error('Order not found')
  if (!order.staff_id) throw new Error('That order has no matched salesperson yet.')
  if (order.cancelled && rank !== null) throw new Error('An excluded sales order cannot receive an Open Bill pick.')
  const subDepartmentId = openBillSub(order)
  await Promise.all([
    assertRunOpen(supabase, order.period_month, subDepartmentId),
    assertOpenBillEnabled(supabase, subDepartmentId, order.period_month),
    assertBillsNotClosed(supabase, [orderId]),
  ])

  if (expectedRank !== undefined) {
    const { data: latest, error } = await supabase.from('sales_order_open_bill_tags')
      .select('bill_rank').eq('order_id', orderId).maybeSingle()
    if (error) throw new Error(`Could not check the current Open Bill pick: ${error.message}`)
    if (((latest as { bill_rank: BillRank } | null)?.bill_rank ?? null) !== expectedRank) {
      throw new Error('Open Bill picks changed while saving. Refresh before retrying.')
    }
  }

  if (rank === null) {
    let removal = supabase.from('sales_order_open_bill_tags').delete().eq('order_id', orderId)
    if (expectedRank !== undefined && expectedRank !== null) removal = removal.eq('bill_rank', expectedRank)
    const { data: removed, error } = await removal.select('order_id')
    if (error) throw new Error(error.message)
    if (expectedRank !== undefined && expectedRank !== null && !removed?.length) {
      throw new Error('Open Bill picks changed while saving. Refresh before retrying.')
    }
  } else {
    const { data: occupied, error: occupiedError } = await supabase.from('sales_order_open_bill_tags')
      .select('order_id').eq('sub_department_id', subDepartmentId).eq('staff_id', order.staff_id)
      .eq('event_date', order.event_date).eq('bill_rank', rank)
    if (occupiedError) throw new Error(`Could not check the occupied Open Bill rank: ${occupiedError.message}`)
    const occupiedIds = ((occupied ?? []) as { order_id: string }[]).map(tag => tag.order_id).filter(id => id !== orderId)
    if (!allowMove && occupiedIds.length > 0) throw new Error('Another order claimed this Open Bill rank while saving. Refresh before retrying.')
    const occupiedOrders = await readOpenBillOrders(supabase, occupiedIds)
    if (occupiedOrders.length !== occupiedIds.length) throw new Error('The occupied Open Bill rank could not be checked. Refresh before saving.')
    await Promise.all([
      ...occupiedOrders.map(row => assertRunOpen(supabase, row.period_month, openBillSub(row))),
      assertBillsNotClosed(supabase, occupiedIds),
    ])
    // Only free the occupant we actually checked. A different order claiming
    // the slot meanwhile must cause a unique-conflict failure, not be deleted.
    if (occupiedIds.length > 0) {
      const { error: freeError } = await supabase
        .from('sales_order_open_bill_tags')
        .delete()
        .eq('sub_department_id', subDepartmentId)
        .eq('staff_id', order.staff_id)
        .eq('event_date', order.event_date)
        .eq('bill_rank', rank)
        .in('order_id', occupiedIds)
      if (freeError) throw new Error(freeError.message)
    }

    const payload = {
      order_id: orderId,
      staff_id: order.staff_id,
      event_date: order.event_date,
      bill_rank: rank,
      auto_suggested: false,
      tagged_by: user.id,
      tagged_at: new Date().toISOString(),
    }
    // A batch expects a vacant order after clearing. INSERT makes a concurrent
    // pick for that same order a conflict instead of silently overwriting it.
    const { error } = expectedRank === null
      ? await supabase.from('sales_order_open_bill_tags').insert(payload)
      : await supabase.from('sales_order_open_bill_tags').upsert(payload, { onConflict: 'order_id' })
    if (error) {
      revalidatePath('/revenue', 'layout')
      throw new Error(`${error.message} The rank may have been cleared. Refresh before retrying.`)
    }
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

  await Promise.all([
    assertRunOpen(supabase, order.period_month, order.sales_import_batches.sub_department_id),
    assertBillsNotClosed(supabase, [orderId]),
  ])

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
  await assertBillsNotClosed(supabase, [orderId])
  const { error } = await supabase.from('sales_order_shares').delete().eq('order_id', orderId).eq('staff_id', staffId)
  if (error) throw new Error(error.message)
  revalidatePath('/revenue', 'layout')
}

/** What taking a bill out, or counting it again, did. */
export interface BillCountResult {
  orderNo: string
  /** False when it was already that way and nothing was written. */
  changed: boolean
  /** Count again: whether the bill counts now. */
  counts?: boolean
  /** Count again: what still keeps it out — the ERP's verdict, or a salesperson who is not ours. */
  stillOut?: string | null
  /** The Open Bill rank it gave up (taken out) or got back (counted again). */
  openBillRank?: number | null
}

/**
 * Take one bill out of its month by hand (2026-09-27, right-click on Sales
 * orders): it stops counting everywhere a cancelled bill does — the month's
 * sales, own and group sales, override, KPI, Open Bill — and stays out through
 * every ERP re-send until somebody counts it again. The rule is the
 * database's (`revenue_exclude_order`, mig 20260927020000): it refuses a month
 * whose run has paid (23RUN) and a bill already out for another reason (23EXC).
 */
export async function excludeOrder(orderId: string, note?: string | null): Promise<BillCountResult> {
  await requirePermission('revenue')
  if (typeof orderId !== 'string' || !orderId) throw new Error('Which bill?')
  const why = typeof note === 'string' ? note.trim().slice(0, 500) : ''
  const supabase = await client()
  await assertBillsNotClosed(supabase, [orderId])
  const { data, error } = await supabase.rpc('revenue_exclude_order', { p_order_id: orderId, p_note: why || null })
  if (error) throw new Error(error.message)
  revalidatePath('/revenue', 'layout')
  return data as BillCountResult
}

/**
 * Count a bill taken out by hand again: it goes back to whatever its document
 * says (in, unless the ERP itself cancelled it meanwhile), with its Open Bill
 * pick back while nobody has claimed that rank by hand.
 */
export async function includeOrder(orderId: string): Promise<BillCountResult> {
  await requirePermission('revenue')
  if (typeof orderId !== 'string' || !orderId) throw new Error('Which bill?')
  const supabase = await client()
  await assertBillsNotClosed(supabase, [orderId])
  const { data, error } = await supabase.rpc('revenue_include_order', { p_order_id: orderId })
  if (error) throw new Error(error.message)
  revalidatePath('/revenue', 'layout')
  return data as BillCountResult
}

/** What giving a bill a brand by hand — or taking the pick off — did. */
export interface BillBrandResult {
  orderNo: string
  /** False when it was already that way and nothing was written. */
  changed: boolean
  /** The brand the bill follows now, whatever decided it. */
  brandCode: string | null
  /** The brand picked here, or null once the pick is off. */
  picked: string | null
}

/**
 * Give a bill a brand for its margin ladder, or take the pick off
 * (2026-09-27, Sales orders › right-click › Brand for the margin) — only a
 * bill nothing else names a brand for. The rule is the database's
 * (`revenue_set_order_brand`, mig 20260927080000): a brand the portal has a
 * ladder for, never over a brand the bill has of its own (23BRD), never in a
 * month whose run has paid (23RUN). Kept through every ERP re-send.
 */
export async function setOrderBrand(orderId: string, brandCode: string | null): Promise<BillBrandResult> {
  await requirePermission('revenue')
  if (typeof orderId !== 'string' || !orderId) throw new Error('Which bill?')
  const code = typeof brandCode === 'string' && brandCode.trim() ? brandCode.trim() : null
  const supabase = await client()
  await assertBillsNotClosed(supabase, [orderId])
  const { data, error } = await supabase.rpc('revenue_set_order_brand', { p_order_id: orderId, p_brand_code: code })
  if (error) throw new Error(error.message)
  revalidatePath('/revenue', 'layout')
  return data as BillBrandResult
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

  await Promise.all([
    assertRunOpen(supabase, order.period_month, order.sales_import_batches.sub_department_id),
    assertBillsNotClosed(supabase, [orderId]),
  ])

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
      `These ${periodMonth.slice(0, 7)} sales are in payroll, so they cannot change until the month comes out of payroll.`,
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
