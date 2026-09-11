'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export interface RevenueCommissionAdjustmentInput {
  gross: number
  expectedSynced: number
  expectedAdjustment: number
  reason: string
}

/** The dedicated RPC records the difference without changing Revenue's source calculation. */
export async function adjustRevenueCommission(
  payrollId: string,
  input: RevenueCommissionAdjustmentInput,
): Promise<void> {
  await requirePermission('hr_costing')
  if (!input || ![input.gross, input.expectedSynced, input.expectedAdjustment].every(Number.isFinite)) {
    throw new Error('Enter valid commission amounts.')
  }
  if (input.gross < 0) throw new Error('Gross commission cannot be negative.')
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (!reason) throw new Error('Enter a reason for the commission adjustment.')
  if (reason.length > 1000) throw new Error('Keep the adjustment reason within 1,000 characters.')

  const supabase = await createClient()
  const { error } = await supabase.rpc('adjust_revenue_payroll_commission', {
    p_payroll_id: payrollId,
    p_gross: input.gross,
    p_expected_synced: input.expectedSynced,
    p_expected_adjustment: input.expectedAdjustment,
    p_reason: reason,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/hr-costing/payroll', 'layout')
  revalidatePath('/hr-costing/payment', 'layout')
  revalidatePath('/revenue', 'layout')
  revalidatePath('/hr-costing')
}
