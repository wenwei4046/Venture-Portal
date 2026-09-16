'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { venueKey, venueName } from '@/lib/venues'

/**
 * Who organised the event at a venue.
 *
 * The ERP names the venue on every order and knows nothing about the
 * organiser, so this is the portal's own fact, typed on the month page beside
 * the sales it explains. Keyed on the venue's matching key rather than on a
 * month: set it once and every month that names that venue carries it.
 *
 * comm_venues postdates database.types.ts — untyped-client convention, as for
 * erp_sync_events and erp_links.
 */
export async function setVenueOrganizer(fd: FormData): Promise<void> {
  const user = await requirePermission('revenue')
  const venue = String(fd.get('venue') ?? '')
  const key = venueKey(venue)
  if (!key) throw new Error('That row has no venue to name an organiser for')

  const organizer = String(fd.get('organizer') ?? '').trim()
  const notes = String(fd.get('notes') ?? '').trim()

  const supabase = (await createClient()) as unknown as SupabaseClient
  const { error } = await supabase.from('comm_venues').upsert(
    {
      venue_key: key,
      display_name: venueName(venue) ?? key,
      organizer: organizer === '' ? null : organizer,
      notes: notes === '' ? null : notes,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    },
    { onConflict: 'venue_key' },
  )
  if (error) throw new Error(`Could not save the organiser: ${error.message}`)

  revalidatePath('/revenue', 'layout')
}
