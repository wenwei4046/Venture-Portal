import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sortFairs, type Fair } from '@/lib/fair-calendar'

/**
 * The fairs, and the bills sitting in another month than their fair's.
 *
 * Since 2026-09-27 the fairs come from the ERP: the salesperson picks the
 * event on the sales order and the delivery carries it (`erp_sync_fair`), so
 * nobody types a fair or an organiser on the portal any more. What is left for
 * a person is the one step that moves money — putting a bill into its fair's
 * month — which the month page offers (`FairMovesPanel`).
 *
 * The calendar is an RPC because it groups on the resolved PLACE — which
 * spellings are one venue lives in `comm_venues.canonical_key`, so only SQL
 * can fold `PISA SPICE ARENA` and `SPICE ARENA` into one row.
 *
 * `comm_venue_events` postdates database.types.ts — untyped-client convention,
 * as for comm_organisers and erp_sync_events.
 */

interface FairRpcRow {
  fair_id: string
  venue_key: string
  display_name: string
  period_month: string
  start_date: string | null
  end_date: string | null
  organiser_id: string | null
  organiser_name: string | null
  erp_organiser_text: string | null
  source: 'manual' | 'erp'
  notes: string | null
  bills: number
  sales_value: number | string
  bills_to_move: number
  value_to_move: number | string | null
  confirmed_to_move: number
  confirmed_value_to_move: number | string | null
}

export async function loadFairCalendar(supabase: SupabaseClient): Promise<Fair[]> {
  const { data, error } = await supabase.rpc('revenue_fair_calendar')
  if (error) throw new Error(`Could not read the fair calendar: ${error.message}`)
  return sortFairs(
    ((data ?? []) as FairRpcRow[]).map(r => ({
      fairId: r.fair_id,
      venueKey: r.venue_key,
      displayName: r.display_name,
      periodMonth: r.period_month,
      startDate: r.start_date,
      endDate: r.end_date,
      organiserId: r.organiser_id,
      organiserName: r.organiser_name,
      erpOrganiserText: r.erp_organiser_text,
      source: r.source,
      notes: r.notes,
      bills: r.bills,
      total: Number(r.sales_value),
      billsToMove: r.bills_to_move,
      valueToMove: Number(r.value_to_move ?? 0),
      confirmedToMove: r.confirmed_to_move ?? 0,
      confirmedValueToMove: Number(r.confirmed_value_to_move ?? 0),
    })),
  )
}

/** One bill whose fair counts in another month than the one it sits in. */
export interface FairMove {
  orderId: string
  orderNo: string
  orderDate: string
  venue: string | null
  salesperson: string
  orderTotal: number
  cancelled: boolean
  fromPeriod: string
  toPeriod: string
  fairStart: string | null
  fairEnd: string | null
  organiser: string | null
  /** A month on either side has paid, or is closed to the feed: it stays. */
  locked: boolean
  /** The ERP or a person placed it at that fair — not the calendar's guess. */
  confirmed: boolean
}

interface MoveRpcRow {
  order_id: string
  order_no: string
  order_date: string
  venue: string | null
  agent_name: string
  employee_name: string | null
  order_total: number | string
  cancelled: boolean
  from_period: string
  to_period: string
  fair_start: string | null
  fair_end: string | null
  organiser: string | null
  locked: boolean
  confirmed: boolean
}

/** Every such bill of one sub-department (`revenue_fair_calendar_moves`). */
export async function loadFairMoves(supabase: SupabaseClient, subDepartmentId: string): Promise<FairMove[]> {
  const { data, error } = await supabase.rpc('revenue_fair_calendar_moves', { p_sub_department_id: subDepartmentId })
  if (error) throw new Error(`Could not read which bills belong to another month's fair: ${error.message}`)
  return ((data ?? []) as MoveRpcRow[]).map(r => ({
    orderId: r.order_id,
    orderNo: r.order_no,
    orderDate: r.order_date,
    venue: r.venue,
    salesperson: r.employee_name ?? r.agent_name,
    orderTotal: Number(r.order_total),
    cancelled: r.cancelled,
    fromPeriod: r.from_period,
    toPeriod: r.to_period,
    fairStart: r.fair_start,
    fairEnd: r.fair_end,
    organiser: r.organiser,
    locked: r.locked,
    confirmed: r.confirmed,
  }))
}
