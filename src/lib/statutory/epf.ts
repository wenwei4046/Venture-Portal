// EPF Third Schedule — table lookup via Supabase
// Part A: employees < 60 years (default)
// Part C: >= 60, non-citizen
// Part E: >= 60, citizen
// Wages > RM20,000: use exact percentages (12% ER / 11% EE), handled in code

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export type EPFPart = 'A' | 'C' | 'E'

export interface EPFResult {
  employer: number
  employee: number
}

/**
 * Look up EPF contributions from the epf_third_schedule table.
 * For wages > RM20,000, exact percentages are used without a DB lookup.
 *
 * @param supabase  — Supabase client (server or admin)
 * @param wage      — Gross wage subject to EPF
 * @param part      — Schedule part (default 'A')
 */
export async function lookupEPF(
  supabase: SupabaseClient<Database>,
  wage: number,
  part: EPFPart = 'A'
): Promise<EPFResult> {
  if (wage > 20000) {
    return {
      employer: Math.round(wage * 0.12 * 100) / 100,
      employee: Math.round(wage * 0.11 * 100) / 100,
    }
  }

  const { data, error } = await supabase
    .from('epf_third_schedule')
    .select('employer, employee')
    .eq('part', part)
    .lte('wage_from', wage)
    .gte('wage_to', wage)
    .single()

  if (error || !data) {
    throw new Error(`EPF lookup failed for wage ${wage}: ${error?.message ?? 'no row found'}`)
  }

  return { employer: data.employer, employee: data.employee }
}
