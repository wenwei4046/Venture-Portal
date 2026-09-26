import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchByKeys } from '@/lib/paginate'
import type { HandExclusion } from '@/lib/commission/bill-exclusion'

/**
 * A month's sales orders, as `revenue_month_orders` returns them.
 *
 * One round trip for the whole month: the RPC does the line work in SQL
 * because a Fair month has ~1,700 lines and PostgREST would hand back the
 * first thousand without saying so.
 *
 * The margin comes from the RPC rather than from a division here, and it is
 * the ENGINE's margin: the base is the commissionable groups (KPI giveaways
 * included, since their cost is real), and it is NULL the moment any line of
 * that base has no cost. A partial cost divided by the whole bill looks like a
 * fat margin and would have HR checking a figure the engine never used.
 */

export type MarginSource = 'manual' | 'cost' | 'none'

export interface MonthOrder {
  orderId: string
  orderNo: string
  orderDate: string
  eventDate: string
  customerName: string | null
  debtorCode: string | null
  /** The spelling the ERP put on the document. */
  venue: string | null
  /** The PLACE that spelling belongs to, once merged. Null when the bill names no venue. */
  venueGroupKey: string | null
  /** The place's tidy name, when the venue register knows it. */
  venueGroupName: string | null
  organizer: string | null
  location: string | null
  brandCode: string | null
  orderTotal: number
  paidAmount: number
  balance: number | null
  cancelled: boolean
  /**
   * Why it is excluded when the ERP is not the reason. `ignored_agent` is a
   * bill the ERP is perfectly happy with, sold by somebody we have said is not
   * ours to pay; `manual` is one bill somebody took out of the month by hand
   * (2026-09-27, `sales_order_exclusions`). Null for an ERP-side exclusion —
   * erpStatus says that itself.
   */
  excludedReason: string | null
  erpStatus: string | null
  erpOnHold: boolean
  sequenceInDay: number | null
  staffId: string | null
  employeeName: string | null
  employeeCode: string | null
  agentName: string
  lineCount: number
  lineAmount: number
  /** What the rate is paid on: commissionable groups, KPI items excluded. */
  commissionable: number
  marginRevenue: number
  /** Null when any line of the margin base has no cost. */
  marginCost: number | null
  marginPct: number | null
  marginSource: MarginSource
  linesWithoutCost: number
  linesWithoutBrand: number
  openBillRank: number | null
  openBillAuto: boolean | null
  depositRequired: number | null
  depositMet: boolean
}

interface Row {
  order_id: string
  order_no: string
  order_date: string
  event_date: string
  customer_name: string | null
  debtor_code: string | null
  venue: string | null
  venue_group_key: string | null
  venue_group_name: string | null
  organizer: string | null
  location: string | null
  brand_code: string | null
  order_total: number | string
  paid_amount: number | string
  balance: number | string | null
  cancelled: boolean
  excluded_reason: string | null
  erp_status: string | null
  erp_on_hold: boolean
  sequence_in_day: number | null
  staff_id: string | null
  employee_name: string | null
  employee_code: string | null
  agent_name: string
  line_count: number
  line_amount: number | string
  commissionable: number | string
  margin_revenue: number | string
  margin_cost: number | string | null
  margin_pct: number | string | null
  margin_source: MarginSource
  lines_without_cost: number
  lines_without_brand: number
  open_bill_rank: number | null
  open_bill_auto: boolean | null
  deposit_required: number | string | null
  deposit_met: boolean
}

export async function loadMonthOrders(
  supabase: SupabaseClient,
  subDepartmentId: string,
  period: string,
): Promise<MonthOrder[]> {
  const { data, error } = await supabase.rpc('revenue_month_orders', {
    p_sub_department_id: subDepartmentId,
    p_period: period,
  })
  if (error) throw new Error(`Could not read the month's orders: ${error.message}`)
  return ((data ?? []) as Row[]).map(r => ({
    orderId: r.order_id,
    orderNo: r.order_no,
    orderDate: r.order_date,
    eventDate: r.event_date,
    customerName: r.customer_name,
    debtorCode: r.debtor_code,
    venue: r.venue,
    venueGroupKey: r.venue_group_key,
    venueGroupName: r.venue_group_name,
    organizer: r.organizer,
    location: r.location,
    brandCode: r.brand_code,
    orderTotal: Number(r.order_total),
    paidAmount: Number(r.paid_amount),
    balance: r.balance === null ? null : Number(r.balance),
    cancelled: r.cancelled,
    excludedReason: r.excluded_reason,
    erpStatus: r.erp_status,
    erpOnHold: r.erp_on_hold,
    sequenceInDay: r.sequence_in_day,
    staffId: r.staff_id,
    employeeName: r.employee_name,
    employeeCode: r.employee_code,
    agentName: r.agent_name,
    lineCount: r.line_count,
    lineAmount: Number(r.line_amount),
    commissionable: Number(r.commissionable),
    marginRevenue: Number(r.margin_revenue),
    marginCost: r.margin_cost === null ? null : Number(r.margin_cost),
    marginPct: r.margin_pct === null ? null : Number(r.margin_pct),
    marginSource: r.margin_source,
    linesWithoutCost: r.lines_without_cost,
    linesWithoutBrand: r.lines_without_brand,
    openBillRank: r.open_bill_rank,
    openBillAuto: r.open_bill_auto,
    depositRequired: r.deposit_required === null ? null : Number(r.deposit_required),
    depositMet: r.deposit_met,
  }))
}

/**
 * An ERP product code a month still has no cost for.
 *
 * `listItemCode` is the Product List row that answers to this code — by the
 * ERP code somebody typed, or by its own item code. Null means the list has
 * never heard of the product; present with `listHasCost` false means it has,
 * and nobody has keyed what it costs.
 */
export interface UncostedProduct {
  productCode: string
  productName: string | null
  itemGroup: string | null
  /** False when the group earns no commission — its cost never reached a margin. */
  commissionable: boolean
  lines: number
  qty: number
  amount: number
  orders: number
  /** The ERP's SKU master carries this code (mirrored onto the Product List). */
  inSkuMaster: boolean
  /** The Product List has a price for it — the line lacks one only because the month was costed before it. */
  hasPrice: boolean
  /** Why nothing priced it: not_in_sku_master / unpriced / no_height / error. */
  reason: string
}

export async function loadUncostedProducts(
  supabase: SupabaseClient,
  subDepartmentId: string,
  period: string,
): Promise<UncostedProduct[]> {
  const { data, error } = await supabase.rpc('revenue_uncosted_products', {
    p_sub_department_id: subDepartmentId,
    p_period: period,
  })
  if (error) throw new Error(`Could not read the month's costs: ${error.message}`)
  return (
    (data ?? []) as Array<{
      product_code: string
      product_name: string | null
      item_group: string | null
      commissionable: boolean
      lines: number
      qty: number | string
      amount: number | string
      orders: number
      in_sku_master: boolean | null
      has_price: boolean | null
      reason: string | null
    }>
  ).map(r => ({
    productCode: r.product_code,
    productName: r.product_name,
    itemGroup: r.item_group,
    commissionable: r.commissionable,
    lines: r.lines,
    qty: Number(r.qty),
    amount: Number(r.amount),
    orders: r.orders,
    inSkuMaster: r.in_sku_master === true,
    hasPrice: r.has_price === true,
    reason: r.reason ?? (r.in_sku_master ? 'unpriced' : 'not_in_sku_master'),
  }))
}

// ─── Bills taken out by hand (2026-09-27) ───────────────────────────────────

/**
 * Who took a bill out of its month, when and why (`sales_order_exclusions`).
 * Only excluded bills can have one, so callers pass just those ids.
 */
export async function loadOrderExclusions(
  supabase: SupabaseClient,
  orderIds: readonly string[],
): Promise<Map<string, HandExclusion>> {
  type Row = { order_id: string; note: string | null; excluded_by_name: string | null; excluded_at: string }
  const rows = await fetchByKeys<Row, string>(orderIds, chunk =>
    supabase
      .from('sales_order_exclusions')
      .select('order_id, note, excluded_by_name, excluded_at')
      .in('order_id', chunk) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
  )
  return new Map(rows.map(r => [r.order_id, { note: r.note, byName: r.excluded_by_name, at: r.excluded_at }]))
}

// ─── Shared bills (2026-09-24) ──────────────────────────────────────────────

/** One `sales_order_shares` row with the holder's name. */
export interface OrderShareView {
  orderId: string
  staffId: string
  name: string
  /** 0.5 = half the bill. */
  pct: number
}

/**
 * Who else holds a part of these bills. Chunked by `fetchByKeys` because a
 * month is several hundred ids and PostgREST takes its filters in the URL.
 */
export async function loadOrderShares(
  supabase: SupabaseClient,
  orderIds: readonly string[],
): Promise<OrderShareView[]> {
  type Row = {
    order_id: string
    staff_id: string
    share_pct: number | string
    // PostgREST embeds a to-one relation as an object; the untyped client types it as a list.
    hr_staff_costs: { employee_name: string } | { employee_name: string }[] | null
  }
  const rows = await fetchByKeys<Row, string>(orderIds, chunk =>
    supabase
      .from('sales_order_shares')
      .select('order_id, staff_id, share_pct, hr_staff_costs (employee_name)')
      .in('order_id', chunk) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
  )
  return rows.map(r => {
    const who = Array.isArray(r.hr_staff_costs) ? r.hr_staff_costs[0] : r.hr_staff_costs
    return {
      orderId: r.order_id,
      staffId: r.staff_id,
      name: who?.employee_name ?? '—',
      pct: Number(r.share_pct),
    }
  })
}

/**
 * Everybody a bill here may be shared with: the sub-department's members,
 * A→Z. A share with somebody outside it would pay nobody — the run only ranks
 * the scheme's own members.
 */
export async function loadShareTeam(
  supabase: SupabaseClient,
  schemeId: string | null,
): Promise<{ staffId: string; name: string }[]> {
  if (!schemeId) return []
  const { data, error } = await supabase
    .from('comm_hierarchy')
    .select('staff_id, hr_staff_costs!comm_hierarchy_staff_id_fkey (employee_name, status)')
    .eq('scheme_id', schemeId)
    .is('effective_to', null)
  if (error) throw new Error(`Could not read the team: ${error.message}`)
  const rows = (data ?? []) as unknown as {
    staff_id: string
    hr_staff_costs: { employee_name: string; status: string | null } | null
  }[]
  return rows
    .filter(r => r.hr_staff_costs && r.hr_staff_costs.status !== 'terminated')
    .map(r => ({ staffId: r.staff_id, name: r.hr_staff_costs!.employee_name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
