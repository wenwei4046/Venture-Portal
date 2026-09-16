'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { venueKey } from '@/lib/venues'

/**
 * The venue register's one editable fact: which spellings are one place.
 *
 * The ORGANISER used to live here too, as a free-text value per venue. It
 * moved to `comm_venue_events` on 2026-09-17 (`setFairOrganiser` in
 * organiser-actions.ts) because the same venue has a different organiser from
 * month to month, and one column could only hold the latest answer while
 * appearing to describe every month at once. The optional note that sat beside
 * it went with it: it was written into `comm_venues.notes` and never displayed
 * anywhere, so nothing was lost by dropping the field rather than finding it a
 * column on the new register page.
 */

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
 * demote a venue other spellings already point at (23VEN). Merging also moves
 * the months already named on the spelling onto the place it becomes, so an
 * organiser typed before the merge is not orphaned by it
 * (`comm_venues_merge_events`).
 *
 * comm_venues postdates database.types.ts — untyped-client convention, as for
 * erp_sync_events and erp_links.
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
