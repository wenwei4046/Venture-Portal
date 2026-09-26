import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sortOrganisers, type Organiser } from '@/lib/organisers'
import type { OrganiserSource, VenueRegisterRow } from '@/lib/venue-register'

/**
 * The venue register and the organiser register, in two round trips.
 *
 * The venue side is an RPC because its grain is the resolved PLACE crossed
 * with the months that place has bills in — a grouping only SQL knows, since
 * which spellings are one place lives in `comm_venues.canonical_key`.
 *
 * The organiser side is a plain select of names. What each organiser has
 * RUN is counted on the page from the venue rows already in hand
 * (`organiserTotals`), not by a second query: the two tables must agree, and
 * they must both narrow when the page is narrowed to one month.
 *
 * `comm_organisers` and `comm_venue_events` postdate database.types.ts —
 * untyped-client convention, as for erp_sync_events and comm_venues.
 */

interface RegisterRpcRow {
  venue_key: string
  display_name: string
  aliases: string[] | null
  period_month: string | null
  sub_department_id: string | null
  organiser_id: string | null
  organiser_name: string | null
  erp_organiser_text: string | null
  source: OrganiserSource | null
  people: number
  bills: number
  sales_value: number | string
}

export async function loadVenueRegister(supabase: SupabaseClient): Promise<VenueRegisterRow[]> {
  const { data, error } = await supabase.rpc('revenue_venue_register')
  if (error) throw new Error(`Could not read the venue register: ${error.message}`)
  return ((data ?? []) as RegisterRpcRow[]).map(r => ({
    venueKey: r.venue_key,
    displayName: r.display_name,
    aliases: r.aliases ?? [],
    periodMonth: r.period_month,
    subDepartmentId: r.sub_department_id,
    organiserId: r.organiser_id,
    organiserName: r.organiser_name,
    erpOrganiserText: r.erp_organiser_text,
    source: r.source,
    people: r.people,
    bills: r.bills,
    total: Number(r.sales_value),
  }))
}

export async function loadOrganisers(supabase: SupabaseClient): Promise<Organiser[]> {
  const { data, error } = await supabase
    .from('comm_organisers')
    .select('id, name, notes, is_active')
  if (error) throw new Error(`Could not read the organisers: ${error.message}`)

  return sortOrganisers(
    ((data ?? []) as Array<{
      id: string
      name: string
      notes: string | null
      is_active: boolean
    }>).map(o => ({ id: o.id, name: o.name, notes: o.notes, isActive: o.is_active })),
  )
}
