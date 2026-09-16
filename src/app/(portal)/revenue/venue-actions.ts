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

/**
 * Say that two spellings are the same place — or take it back.
 *
 * The ERP's venue is typed at the fair, so `PISA SPICE ARENA`, `PISA SPICE
 * ARENA CONVENTION CENTRE` and `SPICE ARENA` all arrive as different venues.
 * Which of them are one place is not something a rule can tell: `SPICE ARENA`
 * and `SETIA SPICE CONVENTION CENTRE` are two halls of one Penang complex,
 * `MID VALLEY` and `MIDVALLEY SOUTHKEY JB` are 300km apart. Only somebody who
 * was there knows, so it is recorded rather than guessed.
 *
 * One level deep: the database refuses an alias of an alias, and refuses to
 * demote a venue other spellings already point at (23VEN).
 */
export async function setVenueCanonical(fd: FormData): Promise<void> {
  const user = await requirePermission('revenue')
  const key = venueKey(String(fd.get('venue') ?? ''))
  if (!key) throw new Error('That row has no venue to merge')

  // An absent field and a deliberate "keep it on its own" both read as blank,
  // and only one of them is a decision. RowForm portals its form out of the
  // table, so a control that forgets to claim it submits nothing — which
  // would land here as a silent unmerge.
  if (!fd.has('canonical')) throw new Error('The merge form sent no choice')
  const target = venueKey(String(fd.get('canonical') ?? ''))
  if (target === key) throw new Error('A venue cannot be an alias of itself')

  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase
    .from('comm_venues')
    .update({
      canonical_key: target,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq('venue_key', key)
    .select('venue_key')

  if (error) {
    // 23VEN is the one-level rule, and its message already explains itself.
    if (error.code === '23VEN') throw new Error(error.message)
    throw new Error(`Could not merge the venue: ${error.message}`)
  }
  // The feed registers every spelling it sends, so a missing row means the two
  // sides disagree about what exists — worth saying rather than silently doing
  // nothing.
  if ((data ?? []).length === 0) {
    throw new Error(`${key} is not in the venue register yet`)
  }

  revalidatePath('/revenue', 'layout')
}
