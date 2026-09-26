import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Open Bill for one month (2026-09-26). August 2026 was paid from the claim
 * form with its Open Bill incentives while September keeps Rules' switch off
 * (user: "open for august, not september"), so a month may carry its own
 * setting (`comm_open_bill_months`) over Rules › Scheme rules. The database
 * asks the same rule — `comm_open_bill_on()` — before it takes a pick.
 *
 * The table postdates database.types.ts — untyped-client convention.
 */

export interface OpenBillMonth {
  /** Whether this month's run pays Open Bill. */
  on: boolean
  /** What Rules › Scheme rules says for every month. */
  rules: boolean
  /** The month's own setting, when it has one. */
  month: boolean | null
}

export function resolveOpenBill(rules: boolean, month: boolean | null): OpenBillMonth {
  return { on: month ?? rules, rules, month }
}

/** The month's own setting, or null when it follows Rules. */
export async function loadOpenBillMonthSetting(
  supabase: SupabaseClient,
  subDepartmentId: string,
  period: string,
): Promise<boolean | null> {
  const { data, error } = await supabase
    .from('comm_open_bill_months')
    .select('enabled')
    .eq('sub_department_id', subDepartmentId)
    .eq('period_month', period)
    .maybeSingle()
  if (error) throw new Error(`Could not read this month's Open Bill setting: ${error.message}`)
  return (data as { enabled: boolean } | null)?.enabled ?? null
}

/** Only whether the month pays Open Bill — the one rule the database asks too. */
export async function openBillOnFor(supabase: SupabaseClient, subDepartmentId: string, period: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('comm_open_bill_on', {
    p_sub_department_id: subDepartmentId,
    p_period: period,
  })
  if (error) throw new Error(`Could not read whether Open Bill pays in ${period.slice(0, 7)}: ${error.message}`)
  return Boolean(data)
}
