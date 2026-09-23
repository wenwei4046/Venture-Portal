'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { venueKey } from '@/lib/venues'
import { fairWindowError, monthOf } from '@/lib/fair-calendar'
import { listSubDepartments } from './_lib/sub-departments'

/**
 * The fair calendar: the days a fair was open, and what that moves.
 *
 * WHY THIS EXISTS. `sales_orders.period_month` used to be the month of
 * `header.so_date` — the day the ERP document was opened in the back office,
 * not the day the customer signed. The August 2026 hand-check found 106 bills
 * worth RM 674,744 in the wrong month because of it, and the feed carries
 * nothing better: no fair, event or campaign date in any delivery, and a
 * `venue_id` that has been NULL on all 552 orders ever received.
 *
 * So a human types when each fair ran, once, and `venue_event_for_order()`
 * reads every bill's month off that.
 *
 * TWO STEPS ON PURPOSE. Saving a fair only ever re-STAMPS which fair a bill
 * belongs to (`comm_venue_events_restamp_orders`); it never moves a month.
 * Moving the month is `applyFairCalendar`, because it moves money between
 * payrolls and has to be able to refuse a run that has already paid.
 */

/**
 * Add or correct a fair.
 *
 * The venue is the PLACE's key, picked from the register — the
 * `comm_venue_events_canonical` trigger resolves an alias anyway, so a fair
 * typed against a merged spelling still lands on the place it belongs to.
 *
 * A fair over month end may count in either month (30 Aug – 2 Sep is a real
 * thing and only the person who was there knows which payroll it belongs to),
 * so the form sends the month and this checks it is one of the two.
 */
export async function upsertFair(fd: FormData): Promise<void> {
  const user = await requirePermission('revenue')

  const id = String(fd.get('id') ?? '').trim()
  const key = venueKey(String(fd.get('venue') ?? ''))
  if (!key) throw new Error('A fair needs a venue')

  const startDate = String(fd.get('start_date') ?? '').trim()
  const endDate = String(fd.get('end_date') ?? '').trim()

  // RowForm portals its form out of the table, so a control that forgets to
  // claim it submits nothing. Blank dates on an EDIT would silently strip a
  // window somebody typed, which is why both are required rather than
  // treated as "leave it alone".
  if (!startDate || !endDate) throw new Error('A fair needs both a first and a last day')

  const periodMonth = String(fd.get('period_month') ?? '').trim() || monthOf(startDate)
  const bad = fairWindowError(startDate, endDate, periodMonth)
  if (bad) throw new Error(bad)

  const organiserId = String(fd.get('organiser_id') ?? '').trim()
  const notes = String(fd.get('notes') ?? '').trim()

  const supabase = (await createClient()) as unknown as SupabaseClient
  const row = {
    venue_key: key,
    period_month: periodMonth,
    start_date: startDate,
    end_date: endDate,
    organiser_id: organiserId === '' ? null : organiserId,
    notes: notes === '' ? null : notes,
    source: 'manual',
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  }

  const { error } = id
    ? await supabase.from('comm_venue_events').update(row).eq('id', id)
    : await supabase.from('comm_venue_events').insert(row)

  if (error) {
    // The no-overlap EXCLUDE. Two fairs at one hall cannot be open on the
    // same day, and if they could, no rule could say which one a bill
    // belonged to.
    if (error.code === '23P01') {
      throw new Error(
        `Another fair at this venue is already open on those days — ${fairWindowError(startDate, endDate, periodMonth) ?? 'shorten one of the two windows'}`,
      )
    }
    if (error.code === '23514') {
      throw new Error('A fair counts in the month it opened or the month it closed')
    }
    throw new Error(`Could not save the fair: ${error.message}`)
  }

  revalidatePath('/revenue', 'layout')
}

/**
 * Remove a fair. Its bills fall back to the month of their order date, which
 * is where they were before the calendar existed — so this un-places them
 * rather than stranding them.
 */
export async function deleteFair(id: string): Promise<void> {
  await requirePermission('revenue')
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { error } = await supabase.from('comm_venue_events').delete().eq('id', id)
  if (error) throw new Error(`Could not remove the fair: ${error.message}`)
  revalidatePath('/revenue', 'layout')
}

/**
 * Move every bill into the month of the fair it was written at.
 *
 * Per sub-department, because that is the grain a run locks at: Fair's August
 * may be reopened while IR's is paid. A sub-department whose months have paid
 * refuses (23RUN) and is reported by name; the others still move, because
 * they are separate payrolls and holding one back to punish another helps
 * nobody.
 *
 * THE RUN MUST BE COMPUTED AGAIN afterwards over every month this touched.
 * The month is the run's input — which bills it pays, which deposit gate
 * releases, which Open Bill picks count — so a run computed before the move
 * is answering a question about a different set of bills.
 */
export async function applyFairCalendar(): Promise<void> {
  await moveBills(false)
}

/**
 * Move only the bills a HUMAN placed at their fair (`fair_source = 'manual'`)
 * and leave the calendar's guesses where they are.
 *
 * The guess reaches back 45 days, so until next month's fairs are typed it
 * pulls next month's bills at the same hall into this one. On 2026-09-23 it
 * wanted 174 of September's bills in August; August's claim form named 96 of
 * them, and the other 78 were September's own fairs at IOI Mall Putrajaya,
 * Mid Valley and MVEC Southkey. No grace window separates the two — their
 * lags overlap — so only a human record can.
 */
export async function applyConfirmedFairCalendar(): Promise<void> {
  await moveBills(true)
}

async function moveBills(confirmedOnly: boolean): Promise<void> {
  await requirePermission('revenue')
  const supabase = (await createClient()) as unknown as SupabaseClient
  const subDepts = await listSubDepartments()

  const moved: string[] = []
  const refused: string[] = []

  for (const sub of subDepts) {
    const { data, error } = await supabase.rpc('revenue_apply_fair_calendar', {
      p_sub_department_id: sub.id,
      p_confirmed_only: confirmedOnly,
    })
    if (error) {
      if (error.code === '23RUN') {
        refused.push(`${sub.name}: ${error.message}`)
        continue
      }
      throw new Error(`Could not move ${sub.name}'s bills: ${error.message}`)
    }
    const row = (data ?? [])[0] as
      | { orders_moved: number; value_moved: number | string; months_touched: string[] }
      | undefined
    if (row && row.orders_moved > 0) {
      moved.push(
        `${sub.name}: ${row.orders_moved} bill${row.orders_moved === 1 ? '' : 's'} across ${row.months_touched.join(', ')}`,
      )
    }
  }

  revalidatePath('/revenue', 'layout')

  // Success is visible in the page itself — the banner goes, the "to move"
  // column empties. A REFUSAL is not, so it is thrown: the button shows the
  // message, and it names what did move so a partial result never reads as
  // nothing having happened.
  if (refused.length > 0) {
    const did = moved.length > 0 ? `Moved — ${moved.join('; ')}. ` : ''
    throw new Error(`${did}Refused — ${refused.join('; ')}`)
  }
}
