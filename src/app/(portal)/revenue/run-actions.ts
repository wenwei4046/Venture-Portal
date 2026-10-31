'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'
import { assertBillsNotClosed, billsClosedReason, staffClosedReason } from './_lib/salesperson-closes'
import { loadOrderShares, loadShareTeam } from './_lib/month-orders'
import { holdersOf, type BillShareAnswer, type BillShareResult, type ShareHolder } from '@/lib/commission/bill-share'
import type { BillMoveAnswer } from '@/lib/commission/bill-move'

/**
 * What a commission month's people change by hand: shares, moves, bills that
 * do not count, keyed margins, a month's costs. Every write is one SQL
 * function or a guarded row write; none of them does commission maths.
 * (Open Bill picks went with Open Bill, 2026-10-31.)
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

// ─── Shares and moves ───────────────────────────────────────────────────────

/** A bill as sharing needs it: whose it is, its month, and who holds a part now. */
interface SharedBill {
  orderNo: string
  ownerStaffId: string | null
  ownerName: string
  periodMonth: string
  subDepartmentId: string
  cancelled: boolean
  /** The owner first, with what nobody else holds. */
  parts: ShareHolder[]
}

async function readSharedBill(supabase: SupabaseClient, orderId: string): Promise<SharedBill> {
  const { data, error } = await supabase
    .from('sales_orders')
    // The FK is named: sales_order_shares joins sales_orders to hr_staff_costs too (PGRST201).
    .select('id, order_no, staff_id, period_month, cancelled, sales_import_batches!inner (sub_department_id), hr_staff_costs!sales_orders_staff_id_fkey (employee_name)')
    .eq('id', orderId)
    .maybeSingle()
  if (error) throw new Error(`Could not read the bill: ${error.message}`)
  const order = data as {
    order_no: string
    staff_id: string | null
    period_month: string
    cancelled: boolean
    sales_import_batches: { sub_department_id: string } | { sub_department_id: string }[]
    hr_staff_costs: { employee_name: string } | { employee_name: string }[] | null
  } | null
  if (!order) throw new Error('Order not found')
  const batch = Array.isArray(order.sales_import_batches) ? order.sales_import_batches[0] : order.sales_import_batches
  const staff = Array.isArray(order.hr_staff_costs) ? order.hr_staff_costs[0] : order.hr_staff_costs
  const ownerName = staff?.employee_name ?? '—'
  const shares = await loadOrderShares(supabase, [orderId])
  return {
    orderNo: order.order_no,
    ownerStaffId: order.staff_id,
    ownerName,
    periodMonth: order.period_month,
    subDepartmentId: batch.sub_department_id,
    cancelled: order.cancelled,
    parts: order.staff_id
      ? holdersOf({ staffId: order.staff_id, name: ownerName }, shares.map(s => ({ staffId: s.staffId, name: s.name, pct: s.pct })))
      : [],
  }
}

/**
 * Only somebody on the bill's sub-department's team can hold a part: the run
 * ranks the scheme's own members, so a part given to anybody else would pay
 * nobody. The same people the menu offers (`loadShareTeam`). Null when they are.
 */
async function offTeamReason(supabase: SupabaseClient, subDepartmentId: string, staffId: string): Promise<string | null> {
  const { data: schemeRow, error: schemeError } = await supabase
    .from('comm_schemes')
    .select('id')
    .eq('sub_department_id', subDepartmentId)
    .eq('is_active', true)
    .is('effective_to', null)
    .maybeSingle()
  if (schemeError) throw new Error(`Could not read the commission scheme: ${schemeError.message}`)
  const schemeId = (schemeRow as { id: string } | null)?.id
  if (!schemeId) return 'This bill’s sub-department has no commission scheme, so no part of it would be paid.'
  const team = await loadShareTeam(supabase, schemeId)
  return team.some(member => member.staffId === staffId)
    ? null
    : 'Only a member of this sub-department’s team can hold a part of its bills.'
}

function shareResult(orderId: string, bill: SharedBill, who: { staffId: string; name: string }, before: number | null, changed: boolean): BillShareResult {
  const now = bill.parts.find(p => p.staffId === who.staffId && p.staffId !== bill.ownerStaffId)
  return {
    orderId, orderNo: bill.orderNo, changed,
    staffId: who.staffId, name: now?.name ?? who.name,
    before, after: now?.pct ?? null, parts: bill.parts,
  }
}

/** The share table's own refusals (a paid month, a part that leaves the owner nothing), as words. */
const SHARE_REFUSALS = new Set(['23RUN', '23SHR'])

/**
 * Share a bill with another team member (2026-09-24), or change their part.
 * Default 50/50: the owner keeps 1 − Σ(shares). Each part is paid at its
 * holder's own rate and climbs its holder's own upline line —
 * `lib/commission/shares.ts`. The table refuses a share with the owner, shares
 * that leave the owner nothing (23SHR) and a paid month (23RUN); this refuses
 * a bill somebody paid on it has closed, a new holder whose own month is
 * closed, and anybody off the sub-department's team (2026-09-30).
 *
 * Answers with the bill's holders as they now stand — the right-click menu's
 * notice — or with why not (`BillShareAnswer`): a refusal is RETURNED, since
 * production hands the browser only a digest of what an action throws.
 */
export async function shareOrder(orderId: string, staffId: string, pct = 0.5): Promise<BillShareAnswer> {
  await requireActionOn('/revenue/[sub]/[period]', 'revenue', 'edit')
  if (typeof orderId !== 'string' || !orderId || typeof staffId !== 'string' || !staffId) {
    return { ok: false, reason: 'Which bill, and who with?' }
  }
  const part = Math.round(pct * 10_000) / 10_000
  if (!(part > 0 && part < 1)) return { ok: false, reason: 'A share is more than 0% and less than 100% of the bill.' }
  const supabase = await client()

  const bill = await readSharedBill(supabase, orderId)
  if (!bill.ownerStaffId) return { ok: false, reason: 'Match this bill to a salesperson before sharing it.' }
  if (bill.ownerStaffId === staffId) return { ok: false, reason: `It is ${bill.ownerName}’s bill already.` }
  if (bill.cancelled) return { ok: false, reason: `${bill.orderNo} does not count this month, so there is nothing to share.` }

  const refused = (await Promise.all([
    runLockReason(supabase, bill.periodMonth, bill.subDepartmentId),
    billsClosedReason(supabase, [orderId]),
    offTeamReason(supabase, bill.subDepartmentId, staffId),
    staffClosedReason(supabase, staffId, bill.subDepartmentId, bill.periodMonth),
  ])).find(reason => reason !== null)
  if (refused) return { ok: false, reason: refused }

  const before = bill.parts.find(p => p.staffId === staffId)?.pct ?? null
  const changed = before === null || Math.abs(before - part) >= 0.00005
  if (changed) {
    const { error } = await supabase
      .from('sales_order_shares')
      .upsert({ order_id: orderId, staff_id: staffId, share_pct: part }, { onConflict: 'order_id,staff_id' })
    if (error) {
      if (SHARE_REFUSALS.has(error.code ?? '')) return { ok: false, reason: error.message }
      throw new Error(error.message)
    }
    revalidatePath('/revenue', 'layout')
  }
  return { ok: true, result: shareResult(orderId, changed ? await readSharedBill(supabase, orderId) : bill, { staffId, name: '—' }, before, changed) }
}

/** Take a share back: the owner holds that part again. Refusals answered, like `shareOrder`. */
export async function unshareOrder(orderId: string, staffId: string): Promise<BillShareAnswer> {
  await requireActionOn('/revenue/[sub]/[period]', 'revenue', 'edit')
  if (typeof orderId !== 'string' || !orderId || typeof staffId !== 'string' || !staffId) {
    return { ok: false, reason: 'Which bill, and who?' }
  }
  const supabase = await client()
  const closed = await billsClosedReason(supabase, [orderId])
  if (closed) return { ok: false, reason: closed }
  const bill = await readSharedBill(supabase, orderId)
  const held = bill.parts.find(p => p.staffId === staffId && p.staffId !== bill.ownerStaffId)
  const { data: removed, error } = await supabase
    .from('sales_order_shares')
    .delete()
    .eq('order_id', orderId)
    .eq('staff_id', staffId)
    .select('staff_id')
  if (error) {
    if (SHARE_REFUSALS.has(error.code ?? '')) return { ok: false, reason: error.message }
    throw new Error(error.message)
  }
  const changed = (removed ?? []).length > 0
  if (changed) revalidatePath('/revenue', 'layout')
  return {
    ok: true,
    result: shareResult(orderId, changed ? await readSharedBill(supabase, orderId) : bill,
      { staffId, name: held?.name ?? '—' }, held?.pct ?? null, changed),
  }
}

/** The move table's own refusals (a paid month, a bill that does not count, nobody named), as words. */
const MOVE_REFUSALS = new Set(['23RUN', '23EXC', '23MOV'])

/**
 * Move a bill to another salesperson (2026-10-12, right-click › *Move to
 * another salesperson…*; the user: "can select move this order to other sales
 * person"), or — `staffId` null, or the salesperson the ERP names — give it
 * back. The rule is the database's (`revenue_move_order`, mig
 * 20261012170000): the bill becomes theirs everywhere a bill's salesperson
 * counts and stays theirs through every ERP re-send; the new holder's share
 * goes and is theirs again when the bill leaves them (mig 20261012190000).
 * This refuses, as a share does, a bill somebody paid on it has closed, a new
 * holder whose own month is closed, and anybody off the sub-department's team.
 *
 * Answers with who holds it now, or with why not (`BillMoveAnswer`).
 */
export async function moveOrder(orderId: string, staffId: string | null, note?: string | null): Promise<BillMoveAnswer> {
  await requireActionOn('/revenue/[sub]/[period]', 'revenue', 'edit')
  if (typeof orderId !== 'string' || !orderId) return { ok: false, reason: 'Which bill?' }
  if (staffId !== null && (typeof staffId !== 'string' || !staffId)) return { ok: false, reason: 'Move it to whom?' }
  const why = typeof note === 'string' ? note.trim().slice(0, 500) : ''
  const supabase = await client()

  const bill = await readSharedBill(supabase, orderId)
  if (bill.cancelled) return { ok: false, reason: `${bill.orderNo} does not count this month — count it again before moving it.` }
  if (staffId !== null && staffId === bill.ownerStaffId) return { ok: false, reason: `It is ${bill.ownerName}’s bill already.` }

  const refused = (await Promise.all([
    runLockReason(supabase, bill.periodMonth, bill.subDepartmentId),
    billsClosedReason(supabase, [orderId]),
    staffId ? offTeamReason(supabase, bill.subDepartmentId, staffId) : Promise.resolve(null),
    staffId ? staffClosedReason(supabase, staffId, bill.subDepartmentId, bill.periodMonth) : Promise.resolve(null),
  ])).find(reason => reason !== null)
  if (refused) return { ok: false, reason: refused }

  const { data, error } = await supabase.rpc('revenue_move_order', { p_order_id: orderId, p_staff_id: staffId, p_note: why || null })
  if (error) {
    if (MOVE_REFUSALS.has(error.code ?? '')) return { ok: false, reason: error.message }
    throw new Error(error.message)
  }
  const moved = data as {
    orderNo: string
    changed: boolean
    staffId: string | null
    fromStaffId?: string | null
    movedBack?: boolean
    shareTaken?: number | string | null
    shareBack?: number | string | null
    shareNotBack?: number | string | null
  }
  const nameOf = await staffNames(supabase, [moved.staffId, moved.fromStaffId ?? null])
  if (moved.changed) revalidatePath('/revenue', 'layout')
  return {
    ok: true,
    result: {
      orderId,
      orderNo: moved.orderNo,
      changed: moved.changed,
      to: { staffId: moved.staffId, name: nameOf(moved.staffId) },
      from: { staffId: moved.fromStaffId ?? bill.ownerStaffId, name: moved.fromStaffId === undefined ? bill.ownerName : nameOf(moved.fromStaffId) },
      movedBack: moved.movedBack === true,
      shareTaken: partOf(moved.shareTaken),
      shareBack: partOf(moved.shareBack),
      shareNotBack: partOf(moved.shareNotBack),
    },
  }
}

/** A part as PostgREST sends a numeric — "0.5000" — or null. */
function partOf(value: number | string | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value)
}

/** Names for a move's notice: a person, or "nobody" for a bill no salesperson is matched to. */
async function staffNames(supabase: SupabaseClient, ids: readonly (string | null)[]): Promise<(id: string | null) => string> {
  const wanted = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))]
  const { data, error } = wanted.length
    ? await supabase.from('hr_staff_costs').select('id, employee_name').in('id', wanted)
    : { data: [], error: null }
  if (error) throw new Error(`Could not read who the bill is with: ${error.message}`)
  const names = new Map(((data ?? []) as { id: string; employee_name: string }[]).map(row => [row.id, row.employee_name]))
  return id => (id ? names.get(id) ?? '—' : 'nobody')
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
}

/**
 * Take one bill out of its month by hand (2026-09-27, right-click on Sales
 * orders): it stops counting everywhere a cancelled bill does — the month's
 * sales, own and group sales, override, KPI — and stays out through
 * every ERP re-send until somebody counts it again. The rule is the
 * database's (`revenue_exclude_order`, mig 20260927020000): it refuses a month
 * whose run has paid (23RUN) and a bill already out for another reason (23EXC).
 */
export async function excludeOrder(orderId: string, note?: string | null): Promise<BillCountResult> {
  await requireActionOn('/revenue/[sub]/[period]', 'revenue', 'edit')
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
 * says (in, unless the ERP itself cancelled it meanwhile).
 */
export async function includeOrder(orderId: string): Promise<BillCountResult> {
  await requireActionOn('/revenue/[sub]/[period]', 'revenue', 'edit')
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
  await requireActionOn('/revenue/[sub]/[period]', 'revenue', 'edit')
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
  const user = await requireActionOn('/revenue', 'revenue', 'edit')
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
  const reason = await runLockReason(supabase, periodMonth, subDepartmentId)
  if (reason) throw new Error(reason)
}

/** `assertRunOpen`'s refusal as words, or null — for an action that returns its refusals. */
async function runLockReason(supabase: SupabaseClient, periodMonth: string, subDepartmentId: string): Promise<string | null> {
  const { data: locked, error } = await supabase.rpc('commission_order_period_locked', {
    p_sub_department_id: subDepartmentId,
    p_period: periodMonth,
  })
  if (error) throw new Error(`Could not check the commission run: ${error.message}`)
  return locked
    ? `These ${periodMonth.slice(0, 7)} sales are in payroll, so they cannot change until the month comes out of payroll.`
    : null
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
  await requireActionOn('/revenue/[sub]/[period]/orders', 'revenue', 'edit')
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
