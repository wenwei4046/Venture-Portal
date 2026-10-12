import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sortFairs, type Fair } from '@/lib/fair-calendar'

/**
 * The fairs.
 *
 * Since 2026-09-27 the fairs come from the ERP: the salesperson picks the
 * event on the sales order and the delivery carries it (`erp_sync_fair`), so
 * nobody types a fair or an organiser on the portal any more. Since
 * 2026-10-12 nobody moves a bill into its fair's month either (the month
 * page's *Bills of another month's fair* went): a bill keyed after its fair's
 * month is paid where it sits and its ledger row says *Late key-in*
 * (`saleMonthOf` in `lib/fair-calendar.ts`, `lib/commission/row-origin.ts`).
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
