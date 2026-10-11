'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'

/**
 * The first month the portal pays (2026-09-26, `comm_cutovers`).
 *
 * Every month before it was settled outside the portal — June to August 2026
 * from the hand-worked claim forms. Its bills never carry into a run, the ERP
 * feed may not change them, and a change the ERP makes to one is a drop or an
 * upsell for HR to confirm in the month it is noticed.
 *
 * comm_cutovers and the RPCs postdate database.types.ts — untyped-client
 * convention.
 */
async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

export async function setFirstPaidMonth(subDepartmentId: string, month: string, note?: string): Promise<void> {
  await requireActionOn('/revenue/[sub]', 'revenue', 'manage')
  if (!/^\d{4}-\d{2}-01$/.test(month)) throw new Error('A month is its first day, e.g. 2026-09-01')

  const supabase = await client()
  const { error } = await supabase.rpc('comm_set_first_paid_month', {
    p_sub_department_id: subDepartmentId,
    p_month: month,
    p_note: note?.trim() || null,
  })
  if (error) throw new Error(`Could not save the month: ${error.message}`)

  revalidatePath('/revenue', 'layout')
}

export async function clearFirstPaidMonth(subDepartmentId: string): Promise<void> {
  await requireActionOn('/revenue/[sub]', 'revenue', 'manage')
  const supabase = await client()
  const { error } = await supabase.rpc('comm_clear_first_paid_month', { p_sub_department_id: subDepartmentId })
  if (error) throw new Error(`Could not clear the month: ${error.message}`)

  revalidatePath('/revenue', 'layout')
}
