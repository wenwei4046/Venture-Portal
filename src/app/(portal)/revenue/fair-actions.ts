'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireAction } from '@/lib/auth'

/**
 * Put bills into the month of the fair they were written at.
 *
 * WHY THIS EXISTS. `sales_orders.period_month` starts as the month of the
 * ERP's `so_date` — the day the document was KEYED, not the day of the sale —
 * and a bill keyed on 2 October for a fair of 28–30 September belongs to
 * September's payroll. Since 2026-09-27 the ERP names the fair on every bill
 * (`erp_sync_fair`), so which month a bill belongs to is known; moving it
 * there is still a person's click, because it moves money between payrolls
 * and has to be able to refuse a run that has already paid (23RUN).
 *
 * CONFIRMED ONLY. A bill the ERP or a person placed at its fair moves; one
 * whose fair is only the calendar's guess from its venue and date stays where
 * it is — on 2026-09-23 that guess wanted 78 of September's own bills in
 * August. (It used to live on Revenue › Venues, with the fair calendar that
 * nobody types into any more.)
 *
 * One sub-department: that is the grain a run locks at. THE RUNS MUST BE
 * COMPUTED AGAIN afterwards over every month this touched — the month is the
 * run's input.
 */
export async function moveConfirmedFairBills(subDepartmentId: string): Promise<{ moved: number; months: string[] }> {
  await requireAction('revenue', 'edit')
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('revenue_apply_fair_calendar', {
    p_sub_department_id: subDepartmentId,
    p_confirmed_only: true,
  })
  if (error) {
    // 23RUN names the month whose run has paid; the message says so plainly.
    throw new Error(error.code === '23RUN' ? error.message : `Could not move the bills: ${error.message}`)
  }
  const row = (data ?? [])[0] as { orders_moved: number; months_touched: string[] } | undefined
  revalidatePath('/revenue', 'layout')
  return { moved: row?.orders_moved ?? 0, months: row?.months_touched ?? [] }
}
