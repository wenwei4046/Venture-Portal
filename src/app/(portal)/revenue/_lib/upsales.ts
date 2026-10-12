import type { SupabaseClient } from '@supabase/supabase-js'
import type { AdjustmentReason, SettledBy } from '@/lib/commission/erp-changes'

/**
 * The month's drops and upsells (2026-09-24): those the ERP found and nobody has
 * answered yet, and those paid into a month. The rules are
 * `lib/commission/upsales.ts`.
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
  /**
   * Why the ERP's figure moved — amount, cancelled, deleted, on_hold,
   * not_counted, reinstated (2026-10-13); null on a row typed by hand or
   * found before then.
   */
  erpReason: AdjustmentReason | null
  /** The month whose pay gave the commission on the bill: a change is paid only after it. */
  settledPeriod: string | null
  /** What gave it: a run, a salesperson's close, the claim form, a month closed to the feed. */
  settledBy: SettledBy | null
  /** The month it is paid in (for a pending one: the first month it may be paid in). */
  periodMonth: string
  amount: number
  soldOn: string
  fairEventId: string | null
  fairLabel: string | null
  originalRef: string
  note: string | null
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
  'erp_doc_no, settled_amount, erp_amount, original_period, period_month, erp_reason, settled_period, settled_by, ' +
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
  erp_reason?: string | null
  settled_period?: string | null
  settled_by?: string | null
  period_month: string
  hr_staff_costs: { employee_name: string } | { employee_name: string }[] | null
  comm_venue_events: FairEmbed | FairEmbed[] | null
}

const REASONS: readonly AdjustmentReason[] = ['amount', 'cancelled', 'deleted', 'on_hold', 'not_counted', 'reinstated']
const SETTLED_BY: readonly SettledBy[] = ['run', 'close', 'hand', 'frozen']

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
    erpReason: REASONS.find(x => x === r.erp_reason) ?? null,
    settledPeriod: r.settled_period ?? null,
    settledBy: SETTLED_BY.find(x => x === r.settled_by) ?? null,
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
