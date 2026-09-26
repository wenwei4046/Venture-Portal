import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * What the month page's Upsales tab reads (2026-09-24): the month's upsales and
 * the fairs one can have been sold at. The rules are `lib/commission/upsales.ts`.
 */

export interface UpsaleView {
  id: string
  staffId: string
  staffName: string
  /** 'upsale' adds (+), 'drop' takes away (−) — the amount carries the sign. */
  kind: 'upsale' | 'drop'
  /** Typed by HR, or found by the ERP feed on a settled bill (2026-09-26). */
  source: 'manual' | 'erp'
  status: 'pending' | 'confirmed' | 'dismissed'
  /** The ERP document the change was found on. */
  erpDocNo: string | null
  /** What was settled on the bill, and what the ERP says now — for a found change. */
  settledAmount: number | null
  erpAmount: number | null
  /** The month the bill was settled in. */
  originalPeriod: string | null
  /** The month it is paid in (for a pending one: the month it was found). */
  periodMonth: string
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

const UPSALE_SELECT =
  'id, staff_id, amount, sold_on, fair_event_id, original_ref, note, created_at, kind, source, status, ' +
  'erp_doc_no, settled_amount, erp_amount, original_period, period_month, ' +
  'hr_staff_costs (employee_name), ' +
  'comm_venue_events (venue_key, start_date, end_date, comm_venues (display_name), comm_organisers (name))'

type UpsaleRow = {
  id: string
  staff_id: string
  amount: number | string
  sold_on: string
  fair_event_id: string | null
  original_ref: string
  note: string | null
  kind: 'upsale' | 'drop' | null
  source: 'manual' | 'erp' | null
  status: 'pending' | 'confirmed' | 'dismissed' | null
  erp_doc_no: string | null
  settled_amount: number | string | null
  erp_amount: number | string | null
  original_period: string | null
  period_month: string
  hr_staff_costs: { employee_name: string } | { employee_name: string }[] | null
  comm_venue_events: FairEmbed | FairEmbed[] | null
}

const money = (v: number | string | null): number | null => (v === null || v === undefined ? null : Number(v))

function toView(r: UpsaleRow): UpsaleView {
  return {
    id: r.id,
    staffId: r.staff_id,
    staffName: one(r.hr_staff_costs)?.employee_name ?? '—',
    kind: r.kind === 'drop' ? 'drop' : 'upsale',
    source: r.source === 'erp' ? 'erp' : 'manual',
    status: r.status ?? 'confirmed',
    erpDocNo: r.erp_doc_no,
    settledAmount: money(r.settled_amount),
    erpAmount: money(r.erp_amount),
    originalPeriod: r.original_period,
    periodMonth: r.period_month,
    amount: Number(r.amount),
    soldOn: r.sold_on,
    fairEventId: r.fair_event_id,
    fairLabel: labelOf(one(r.comm_venue_events)),
    originalRef: r.original_ref,
    note: r.note,
  }
}

/** The upsales and drops this month's run pays: the confirmed ones. */
export async function loadMonthUpsales(
  supabase: SupabaseClient,
  subDepartmentId: string,
  period: string,
): Promise<UpsaleView[]> {
  const { data, error } = await supabase
    .from('comm_upsales')
    .select(UPSALE_SELECT)
    .eq('sub_department_id', subDepartmentId)
    .eq('period_month', period)
    .eq('status', 'confirmed')
    .order('sold_on')
    .order('created_at')
  if (error) throw new Error(`Could not read the month’s upsales and drops: ${error.message}`)
  return ((data ?? []) as unknown as UpsaleRow[]).map(toView)
}

/**
 * Every drop and upsell the ERP revealed that nobody has answered yet, from
 * any month — they are paid in the month somebody confirms them.
 */
export async function loadPendingAdjustments(
  supabase: SupabaseClient,
  subDepartmentId: string,
): Promise<UpsaleView[]> {
  const { data, error } = await supabase
    .from('comm_upsales')
    .select(UPSALE_SELECT)
    .eq('sub_department_id', subDepartmentId)
    .eq('status', 'pending')
    .order('sold_on')
    .order('created_at')
  if (error) throw new Error(`Could not read the changes the ERP made: ${error.message}`)
  return ((data ?? []) as unknown as UpsaleRow[]).map(toView)
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
