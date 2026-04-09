// EIS Act 800 Schedule — table lookup via Supabase
// Ceiling: RM5,000
// Both employer and employee contributions

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export interface EISResult {
  employer: number
  employee: number
}

/**
 * Look up EIS contributions from the eis_act800_schedule table.
 * Wages above RM5,000 are capped at the RM5,000 row.
 *
 * @param supabase — Supabase client
 * @param wage    — Gross wage subject to EIS
 */
export async function lookupEIS(
  supabase: SupabaseClient<Database>,
  wage: number
): Promise<EISResult> {
  const effectiveWage = Math.min(wage, 5000)

  const { data, error } = await supabase
    .from('eis_act800_schedule')
    .select('employer, employee')
    .lte('wage_from', effectiveWage)
    .gte('wage_to', effectiveWage)
    .single()

  if (error || !data) {
    throw new Error(`EIS lookup failed for wage ${wage}: ${error?.message ?? 'no row found'}`)
  }

  return { employer: data.employer, employee: data.employee }
}
