import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sortFairs, type Fair, type FairGap } from '@/lib/fair-calendar'

/**
 * The fair calendar and the holes in it, in two round trips.
 *
 * Both are RPCs because both group on the resolved PLACE — which spellings
 * are one venue lives in `comm_venues.canonical_key`, so only SQL can fold
 * `PISA SPICE ARENA` and `SPICE ARENA` into one row.
 *
 * The gaps side is the one that matters day to day: it is the work list.
 * Every (place, month) with bills and no fair covering them, biggest first,
 * with the spread of their order dates — because a place whose bills run over
 * three weeks held more than one fair that month, and one wide window would
 * be a lie that the organiser column then inherits.
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

interface GapRpcRow {
  venue_key: string
  display_name: string
  period_month: string
  bills: number
  sales_value: number | string
  first_order: string
  last_order: string
  spread_days: number
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

export async function loadFairGaps(supabase: SupabaseClient): Promise<FairGap[]> {
  const { data, error } = await supabase.rpc('revenue_fair_calendar_gaps')
  if (error) throw new Error(`Could not read the unplaced bills: ${error.message}`)
  return ((data ?? []) as GapRpcRow[]).map(r => ({
    venueKey: r.venue_key,
    displayName: r.display_name,
    periodMonth: r.period_month,
    bills: r.bills,
    total: Number(r.sales_value),
    firstOrder: r.first_order,
    lastOrder: r.last_order,
    spreadDays: r.spread_days,
  }))
}
