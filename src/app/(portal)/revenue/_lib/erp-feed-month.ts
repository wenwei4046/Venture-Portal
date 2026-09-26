import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Whether a month is closed to the ERP feed, and what the feed has held for
 * it since (2026-09-26). A month is closed by hand (`erp_feed_closed_months`),
 * or because it falls before the first month the portal pays
 * (`comm_cutovers`) — settled outside the portal. Read by the month page's
 * "Live from ERP" chip and by the list of months.
 *
 * The tables postdate database.types.ts — untyped-client convention.
 */

export interface ClosedMonthView {
  closedAt: string
  closedByName: string | null
  note: string | null
  /** 'closed' = somebody closed it; 'before_cutover' = the portal pays from a later month. */
  reason: 'closed' | 'before_cutover'
}

export interface CutoverView {
  firstPaidMonth: string
  setAt: string
  setByName: string | null
  note: string | null
}

export interface ErpFeedMonthView {
  /** This sub-department is the one the Houzs ERP feeds (Fair). */
  fed: boolean
  closed: ClosedMonthView | null
  /** Deliveries held for this month and not yet replayed. */
  held: number
  /** The first month the portal pays, when one is set. */
  firstPaidMonth: string | null
}

interface ClosedRow {
  period_month: string
  closed_at: string
  closed_by_name: string | null
  note: string | null
}

export async function loadClosedMonths(
  supabase: SupabaseClient,
  subDepartmentId: string,
): Promise<Map<string, ClosedMonthView>> {
  const { data, error } = await supabase
    .from('erp_feed_closed_months')
    .select('period_month, closed_at, closed_by_name, note')
    .eq('sub_department_id', subDepartmentId)
  if (error) throw new Error(`Could not read which months are closed to the ERP feed: ${error.message}`)
  return new Map(((data ?? []) as ClosedRow[]).map(r => [
    r.period_month,
    { closedAt: r.closed_at, closedByName: r.closed_by_name, note: r.note, reason: 'closed' as const },
  ]))
}

export async function loadCutover(supabase: SupabaseClient, subDepartmentId: string): Promise<CutoverView | null> {
  const { data, error } = await supabase
    .from('comm_cutovers')
    .select('first_paid_month, set_at, set_by_name, note')
    .eq('sub_department_id', subDepartmentId)
    .maybeSingle()
  if (error) throw new Error(`Could not read when the portal starts paying: ${error.message}`)
  const row = data as { first_paid_month: string; set_at: string; set_by_name: string | null; note: string | null } | null
  return row ? { firstPaidMonth: row.first_paid_month, setAt: row.set_at, setByName: row.set_by_name, note: row.note } : null
}

/** A month before the cutover, described as closed. */
export function settledByHand(period: string, cutover: CutoverView | null): ClosedMonthView | null {
  if (!cutover || period >= cutover.firstPaidMonth) return null
  return { closedAt: cutover.setAt, closedByName: cutover.setByName, note: cutover.note, reason: 'before_cutover' }
}

/**
 * Null when the feed's state cannot be read — the month page then shows no
 * chip rather than a "live" one it cannot vouch for, and the rest of the page
 * stands.
 */
export async function loadErpFeedMonth(
  supabase: SupabaseClient,
  subDepartmentId: string,
  period: string,
): Promise<ErpFeedMonthView | null> {
  try {
    const { data: feedSub, error } = await supabase.rpc('erp_sync_sub_department')
    if (error) throw new Error(`Could not identify the ERP programme: ${error.message}`)
    const [closed, cutover, { count, error: heldError }] = await Promise.all([
      loadClosedMonths(supabase, subDepartmentId),
      loadCutover(supabase, subDepartmentId),
      supabase
        .from('erp_sync_events')
        .select('id', { count: 'exact', head: true })
        .eq('sub_department_id', subDepartmentId)
        .eq('period_month', period)
        .eq('status', 'held')
        .is('replayed_at', null),
    ])
    if (heldError) throw new Error(`Could not count the held deliveries: ${heldError.message}`)
    return {
      fed: feedSub === subDepartmentId,
      // Settled by hand outranks closed by hand: reopening such a month would
      // hand the feed a month the cutover still holds.
      closed: settledByHand(period, cutover) ?? closed.get(period) ?? null,
      held: count ?? 0,
      firstPaidMonth: cutover?.firstPaidMonth ?? null,
    }
  } catch (err) {
    console.error('[erp-feed-month]', err instanceof Error ? err.message : err)
    return null
  }
}

/** The closed months for the list of months; empty when they cannot be read. */
export async function loadClosedMonthsOrNone(
  supabase: SupabaseClient,
  subDepartmentId: string,
): Promise<Map<string, ClosedMonthView>> {
  try {
    return await loadClosedMonths(supabase, subDepartmentId)
  } catch (err) {
    console.error('[erp-feed-month]', err instanceof Error ? err.message : err)
    return new Map()
  }
}

/** The cutover for the list of months; none when it cannot be read. */
export async function loadCutoverOrNone(supabase: SupabaseClient, subDepartmentId: string): Promise<CutoverView | null> {
  try {
    return await loadCutover(supabase, subDepartmentId)
  } catch (err) {
    console.error('[erp-feed-month]', err instanceof Error ? err.message : err)
    return null
  }
}
