import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Whether a month is closed to the ERP feed, and what the feed has held for
 * it since (2026-09-26, `erp_feed_closed_months`). Read by the month page's
 * "Live from ERP" chip and by the list of months.
 *
 * erp_feed_closed_months / erp_sync_events postdate database.types.ts —
 * untyped-client convention.
 */

export interface ClosedMonthView {
  closedAt: string
  closedByName: string | null
  note: string | null
}

export interface ErpFeedMonthView {
  /** This sub-department is the one the Houzs ERP feeds (Fair). */
  fed: boolean
  closed: ClosedMonthView | null
  /** Deliveries held for this month and not yet replayed. */
  held: number
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
    { closedAt: r.closed_at, closedByName: r.closed_by_name, note: r.note },
  ]))
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
    if (feedSub !== subDepartmentId) return { fed: false, closed: null, held: 0 }

    const [closed, { count, error: heldError }] = await Promise.all([
      loadClosedMonths(supabase, subDepartmentId),
      supabase
        .from('erp_sync_events')
        .select('id', { count: 'exact', head: true })
        .eq('sub_department_id', subDepartmentId)
        .eq('period_month', period)
        .eq('status', 'held')
        .is('replayed_at', null),
    ])
    if (heldError) throw new Error(`Could not count the held deliveries: ${heldError.message}`)
    return { fed: true, closed: closed.get(period) ?? null, held: count ?? 0 }
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
