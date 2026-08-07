'use server'

// Bank BA registry actions (user 2026-08-07). Registry + calculator layer
// only — REAL money keeps booking through Fund In (owe HC) and Fund Out
// (lend to the sub); a BA row can link to those records. No JE is posted
// from here, so nothing double-books.

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

// ba_facilities postdates the generated database.types.ts — same untyped
// client convention as the allocator tables.
async function baClient(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient
}

export interface BaInput {
  baNo: string
  bankName: string
  faceAmount: number
  bankAnnualRatePct: number
  startDate: string
  tenorDays: number
  chargeRatePctMonthly: number
  hcRatePctMonthly: number
  borrowerCompanyId: string | null
  borrowerName: string
  notes: string
}

export async function createBa(input: BaInput): Promise<{ error?: string }> {
  try {
    const user = await requireRole(['finance', 'principal'])
    const supabase = await baClient()

    if (!(input.faceAmount > 0)) return { error: 'Face amount must be greater than 0' }
    if (!(input.tenorDays > 0)) return { error: 'Tenor (days) must be greater than 0' }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) return { error: 'Start date is required' }

    const { error } = await supabase.from('ba_facilities').insert({
      ba_no: input.baNo.trim() || null,
      bank_name: input.bankName.trim() || null,
      face_amount: input.faceAmount,
      bank_annual_rate: input.bankAnnualRatePct / 100,
      start_date: input.startDate,
      tenor_days: Math.round(input.tenorDays),
      charge_rate_monthly: input.chargeRatePctMonthly / 100,
      hc_rate_monthly: input.hcRatePctMonthly / 100,
      borrower_company_id: input.borrowerCompanyId,
      borrower_name: input.borrowerName.trim() || null,
      notes: input.notes.trim() || null,
      created_by: user.id,
    })
    if (error) return { error: `Save failed: ${error.message}` }

    revalidatePath('/ba')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Save failed' }
  }
}

export async function setBaStatus(
  id: string,
  status: 'active' | 'settled' | 'cancelled',
): Promise<{ error?: string }> {
  try {
    await requireRole(['finance', 'principal'])
    const supabase = await baClient()
    const { error } = await supabase
      .from('ba_facilities')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return { error: `Update failed: ${error.message}` }
    revalidatePath('/ba')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Update failed' }
  }
}

export async function setBaNotes(id: string, notes: string): Promise<{ error?: string }> {
  try {
    await requireRole(['finance', 'principal'])
    const supabase = await baClient()
    const { error } = await supabase
      .from('ba_facilities')
      .update({ notes: notes.trim() || null, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return { error: `Update failed: ${error.message}` }
    revalidatePath('/ba')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Update failed' }
  }
}
