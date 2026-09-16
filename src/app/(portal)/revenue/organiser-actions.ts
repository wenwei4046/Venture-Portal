'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { organiserName } from '@/lib/organisers'
import { venueKey } from '@/lib/venues'

/**
 * The organiser register, and who ran which fair.
 *
 * The ERP names the venue on every order and knows nothing about the
 * organiser, so both facts are the portal's own. They are kept apart on
 * purpose:
 *
 *   comm_organisers     the NAME, typed once
 *   comm_venue_events   which organiser ran a venue in a given MONTH
 *
 * because the same venue has a different organiser from month to month — the
 * user's own words, 2026-09-17: "same venue will have different organiser".
 * A global column on the venue could not hold that, and editing it rewrote
 * every month that venue ever sold at.
 *
 * comm_organisers and comm_venue_events postdate database.types.ts —
 * untyped-client convention, as for comm_venues and erp_sync_events.
 */

/** Add an organiser, or rename / retire one. */
export async function upsertOrganiser(fd: FormData): Promise<void> {
  const user = await requirePermission('revenue')
  const id = String(fd.get('id') ?? '').trim()
  const name = organiserName(String(fd.get('name') ?? ''))
  if (!name) throw new Error('An organiser needs a name')
  const notes = String(fd.get('notes') ?? '').trim()
  // A tick absent from the FormData is unticked — the browser sends nothing
  // for an unchecked box. Every row's form carries one, so absent means off.
  const isActive = fd.get('is_active') !== null

  const supabase = (await createClient()) as unknown as SupabaseClient
  const row = {
    name,
    notes: notes === '' ? null : notes,
    is_active: isActive,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  }

  const { error } = id
    ? await supabase.from('comm_organisers').update(row).eq('id', id)
    : await supabase.from('comm_organisers').insert(row)

  if (error) {
    // uq_comm_organisers_key is on organiser_key(name): the whole point of the
    // register is that HOMEDEC and Homedec are one organiser, so say so rather
    // than reporting a constraint.
    if (error.code === '23505') {
      throw new Error(`${name} is already in the register — the same name, however it is spelled`)
    }
    throw new Error(`Could not save the organiser: ${error.message}`)
  }

  revalidatePath('/revenue', 'layout')
}

/**
 * Remove an organiser from the register.
 *
 * Refused by the database (23503) once any fair is recorded against it —
 * deleting it would leave those months unexplained. Retiring it is the answer:
 * it drops out of every dropdown and keeps the history it accounts for.
 */
export async function deleteOrganiser(id: string): Promise<void> {
  await requirePermission('revenue')
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { error } = await supabase.from('comm_organisers').delete().eq('id', id)
  if (error) {
    if (error.code === '23503') {
      throw new Error('Fairs are recorded against this organiser — untick Active instead')
    }
    throw new Error(`Could not remove the organiser: ${error.message}`)
  }
  revalidatePath('/revenue', 'layout')
}

/**
 * Who ran the fair at this venue, in this month.
 *
 * Both callers hand over the PLACE's key — the register RPC only returns
 * canonical venues and the month page groups on `venue_group_key` — and the
 * `comm_venue_events_canonical` trigger resolves anything else on the way in,
 * so naming the organiser on a merged venue names it once, for the place.
 *
 * Blank takes the fair back to unnamed, by deleting the row rather than
 * storing a null: no row means nobody has said, which is the state the ERP
 * feed is allowed to fill in. A null with `source = 'manual'` would mean
 * "a human says nobody ran it", and would lock the feed out for ever.
 */
export async function setFairOrganiser(fd: FormData): Promise<void> {
  const user = await requirePermission('revenue')
  const key = venueKey(String(fd.get('venue') ?? ''))
  if (!key) throw new Error('That row has no venue to name an organiser for')

  const period = String(fd.get('period') ?? '')
  if (!/^\d{4}-\d{2}-01$/.test(period)) {
    throw new Error('A fair belongs to a month — none was sent with this row')
  }

  // An absent field and a deliberate "nobody" both read as blank, and only one
  // of them is a decision. A raw <select> inside a RowForm is never submitted
  // (the form is portalled out of the table), so a control that forgets to
  // claim its form would land here as a silent unname.
  if (!fd.has('organiser')) throw new Error('The organiser form sent no choice')
  const organiserId = String(fd.get('organiser') ?? '').trim()

  const supabase = (await createClient()) as unknown as SupabaseClient

  if (organiserId === '') {
    const { error } = await supabase
      .from('comm_venue_events')
      .delete()
      .eq('venue_key', key)
      .eq('period_month', period)
    if (error) throw new Error(`Could not clear the organiser: ${error.message}`)
  } else {
    const { error } = await supabase.from('comm_venue_events').upsert(
      {
        venue_key: key,
        period_month: period,
        organiser_id: organiserId,
        source: 'manual',
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      { onConflict: 'venue_key,period_month' },
    )
    if (error) throw new Error(`Could not save the organiser: ${error.message}`)
  }

  revalidatePath('/revenue', 'layout')
}
