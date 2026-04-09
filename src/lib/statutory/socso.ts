// SOCSO Act 4 Schedule — table lookup via Supabase
// First category: employees < 60, both employer + employee contributions
// Second category: employees >= 60, employer-only
// Ceiling: RM6,000

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export type SOCSOCategory = 'first' | 'second'

export interface SOCSOResult {
  employer: number
  employee: number
}

/**
 * Look up SOCSO contributions from the socso_act4_schedule table.
 * Wages above RM6,000 are capped at the RM6,000 row.
 *
 * @param supabase   — Supabase client
 * @param wage       — Gross wage subject to SOCSO
 * @param category   — 'first' (< 60) or 'second' (>= 60)
 */
export async function lookupSOCSO(
  supabase: SupabaseClient<Database>,
  wage: number,
  category: SOCSOCategory = 'first'
): Promise<SOCSOResult> {
  const effectiveWage = Math.min(wage, 6000)

  const { data, error } = await supabase
    .from('socso_act4_schedule')
    .select('employer, employee')
    .eq('category', category)
    .lte('wage_from', effectiveWage)
    .gte('wage_to', effectiveWage)
    .single()

  if (error || !data) {
    throw new Error(`SOCSO lookup failed for wage ${wage}: ${error?.message ?? 'no row found'}`)
  }

  return { employer: data.employer, employee: data.employee }
}
