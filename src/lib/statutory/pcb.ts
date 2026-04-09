// PCB (Jadual PCB) — table lookup via Supabase
// Income is post-EPF-EE deduction (chargeable income)
// HR can manually override the looked-up PCB amount

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { PCBCategory } from '@/types'

/**
 * Look up monthly PCB from the pcb_jadual table.
 * Income passed here is net of EPF employee deduction.
 *
 * @param supabase      — Supabase client
 * @param income        — Monthly chargeable income (after EPF EE)
 * @param category      — 'KA1' single | 'KA2' married (spouse not working) | 'KA3' married (spouse working)
 * @param childrenCount — Number of qualifying children
 */
export async function lookupPCB(
  supabase: SupabaseClient<Database>,
  income: number,
  category: PCBCategory,
  childrenCount: number
): Promise<number> {
  const { data, error } = await supabase
    .from('pcb_jadual')
    .select('pcb_amount')
    .eq('category', category)
    .eq('children', childrenCount)
    .lte('income_from', income)
    .gte('income_to', income)
    .single()

  if (error || !data) {
    throw new Error(
      `PCB lookup failed for income ${income}, category ${category}, children ${childrenCount}: ${error?.message ?? 'no row found'}`
    )
  }

  return data.pcb_amount
}
