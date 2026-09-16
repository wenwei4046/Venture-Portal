import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

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
  listItemCode: string | null
  listHasCost: boolean
  /** The ERP's own SKU master carries this code — so the empty cost is ITS
   *  gap, and filling it there fixes every system at once. */
  inSkuMaster: boolean
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
      list_item_code: string | null
      list_has_cost: boolean | null
      in_sku_master: boolean | null
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
    listItemCode: r.list_item_code,
    listHasCost: r.list_has_cost === true,
    inSkuMaster: r.in_sku_master === true,
  }))
}

/** Why an order earns nothing, in the ERP's own words. Null when it earns. */
export function exclusionReason(o: MonthOrder): string | null {
  if (!o.cancelled) return null
  if (o.erpOnHold) return 'On hold in the ERP'
  if (o.erpStatus === 'DELETED') return 'Deleted in the ERP'
  if (o.erpStatus) return `${o.erpStatus.replace(/_/g, ' ').toLowerCase()} in the ERP`
  return 'Excluded'
}
