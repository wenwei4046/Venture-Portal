'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'

/**
 * Answering "is this one bill claimed twice?" (2026-09-26).
 *
 * The answer covers exactly the bills in the group when it was given
 * (`comm_double_claim_dismissals.order_ids`, read by the database, not sent
 * from the page), so a bill that joins the group later asks again by itself.
 *
 * The RPCs postdate database.types.ts — untyped-client convention.
 */
async function client(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

/** "Checked — these are separate sales." Returns how many bills the answer covers. */
export async function dismissDoubleClaim(subDepartmentId: string, billRef: string, note?: string): Promise<number> {
  await requirePermission('revenue')
  if (!subDepartmentId || !billRef.trim()) throw new Error('Nothing to answer')

  const supabase = await client()
  const { data, error } = await supabase.rpc('revenue_dismiss_double_claim', {
    p_sub_department_id: subDepartmentId,
    p_bill_ref: billRef.trim(),
    p_note: note?.trim() || null,
  })
  if (error) throw new Error(`Could not save that answer: ${error.message}`)

  revalidatePath('/revenue', 'layout')
  return Number(data ?? 0)
}

/** Take the answer back, so the group is asked about again. */
export async function restoreDoubleClaim(subDepartmentId: string, billRef: string): Promise<void> {
  await requirePermission('revenue')
  if (!subDepartmentId || !billRef.trim()) throw new Error('Nothing to restore')

  const supabase = await client()
  const { error } = await supabase.rpc('revenue_restore_double_claim', {
    p_sub_department_id: subDepartmentId,
    p_bill_ref: billRef.trim(),
  })
  if (error) throw new Error(`Could not take that answer back: ${error.message}`)

  revalidatePath('/revenue', 'layout')
}
