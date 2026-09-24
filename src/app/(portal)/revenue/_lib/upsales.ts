import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * What the month page's Upsales tab reads (2026-09-24): the month's upsales and
 * the fairs one can have been sold at. The rules are `lib/commission/upsales.ts`.
 */

export interface UpsaleView {
  id: string
  staffId: string
  staffName: string
  amount: number
  soldOn: string
  fairEventId: string | null
  fairLabel: string | null
  originalRef: string
  note: string | null
}

export interface FairChoice {
  id: string
  label: string
  startDate: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "28–31 Aug", or "31 Jul–2 Aug" across a month end. */
export function fairDays(start: string, end: string | null): string {
  const [, sm, sd] = start.split('-').map(Number)
  if (!end || end === start) return `${sd} ${MONTHS[sm - 1]}`
  const [, em, ed] = end.split('-').map(Number)
  return sm === em ? `${sd}–${ed} ${MONTHS[sm - 1]}` : `${sd} ${MONTHS[sm - 1]}–${ed} ${MONTHS[em - 1]}`
}

export function fairLabel(place: string, start: string, end: string | null, organiser: string | null): string {
  return [place, fairDays(start, end), organiser].filter(Boolean).join(' · ')
}

/** PostgREST embeds a to-one relation as an object or a one-element array. */
function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

type FairEmbed = {
  venue_key: string
  start_date: string | null
  end_date: string | null
  comm_venues: { display_name: string } | { display_name: string }[] | null
  comm_organisers: { name: string } | { name: string }[] | null
}

function labelOf(f: FairEmbed | null): string | null {
  if (!f || !f.start_date) return null
  return fairLabel(
    one(f.comm_venues)?.display_name ?? f.venue_key,
    f.start_date,
    f.end_date,
    one(f.comm_organisers)?.name ?? null,
  )
}

export async function loadMonthUpsales(
  supabase: SupabaseClient,
  subDepartmentId: string,
  period: string,
): Promise<UpsaleView[]> {
  const { data, error } = await supabase
    .from('comm_upsales')
    .select(
      'id, staff_id, amount, sold_on, fair_event_id, original_ref, note, created_at, ' +
        'hr_staff_costs (employee_name), ' +
        'comm_venue_events (venue_key, start_date, end_date, comm_venues (display_name), comm_organisers (name))',
    )
    .eq('sub_department_id', subDepartmentId)
    .eq('period_month', period)
    .order('sold_on')
    .order('created_at')
  if (error) throw new Error(`Could not read the month’s upsales: ${error.message}`)

  return ((data ?? []) as unknown as Array<{
    id: string
    staff_id: string
    amount: number | string
    sold_on: string
    fair_event_id: string | null
    original_ref: string
    note: string | null
    hr_staff_costs: { employee_name: string } | { employee_name: string }[] | null
    comm_venue_events: FairEmbed | FairEmbed[] | null
  }>).map(r => ({
    id: r.id,
    staffId: r.staff_id,
    staffName: one(r.hr_staff_costs)?.employee_name ?? '—',
    amount: Number(r.amount),
    soldOn: r.sold_on,
    fairEventId: r.fair_event_id,
    fairLabel: labelOf(one(r.comm_venue_events)),
    originalRef: r.original_ref,
    note: r.note,
  }))
}

/**
 * The fairs an upsale recorded under this month can have been sold at: this
 * month's and last month's (a month-end fair is often paid the month after).
 */
export async function loadFairChoices(supabase: SupabaseClient, period: string): Promise<FairChoice[]> {
  const [y, m] = period.split('-').map(Number)
  const from = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10)
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('comm_venue_events')
    .select('id, venue_key, start_date, end_date, comm_venues (display_name), comm_organisers (name)')
    .not('start_date', 'is', null)
    .gte('start_date', from)
    .lte('start_date', to)
    .order('start_date')
  if (error) throw new Error(`Could not read the fair calendar: ${error.message}`)
  return ((data ?? []) as unknown as Array<FairEmbed & { id: string }>).map(f => ({
    id: f.id,
    label: labelOf(f) ?? f.venue_key,
    startDate: f.start_date as string,
  }))
}
