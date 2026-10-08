'use server'

import { revalidatePath } from 'next/cache'
import { requireAction } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PAYROLL_STATUTORY_FIELDS } from '@/lib/payroll-grid'
import type { PayrollRowUpdate } from './actions'

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
  rowUpdates?: PayrollRowUpdate,
): Promise<void> {
  await requireAction('hr_costing', 'edit')
  if (!input || ![input.gross, input.expectedSynced, input.expectedAdjustment].every(Number.isFinite)) {
    throw new Error('Enter valid commission amounts.')
  }
  if (input.gross < 0) throw new Error('Gross commission cannot be negative.')
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (!reason) throw new Error('Enter a reason for the commission adjustment.')
  if (reason.length > 1000) throw new Error('Keep the adjustment reason within 1,000 characters.')

  // The row's other edits, saved in the adjustment's transaction — typed
  // statutory figures included (2026-09-30): the RPC writes each to its
  // override column, where the compute trigger picks it up.
  const allowed = new Set<string>([
    'basic_salary', 'statutory_allowance', 'non_statutory_allowance',
    'ot_hours', 'ot_amount', 'unpaid_leave_days', 'deduction_amount', 'skbbk_amount',
    ...PAYROLL_STATUTORY_FIELDS,
  ])
  const writes: Record<string, number> = {}
  if (rowUpdates !== undefined && (!rowUpdates || typeof rowUpdates !== 'object' || Array.isArray(rowUpdates))) {
    throw new Error('Enter valid payroll row updates.')
  }
  for (const [field, value] of Object.entries(rowUpdates ?? {})) {
    if (!allowed.has(field)) throw new Error(`Unknown or protected payroll field: ${field}`)
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${field} must be a finite number.`)
    }
    if (!['deduction_amount', 'skbbk_amount'].includes(field) && value < 0) {
      throw new Error(`${field} cannot be negative.`)
    }
    writes[field] = value
  }

  const supabase = await createClient()
  const args = {
    p_payroll_id: payrollId,
    p_gross: input.gross,
    p_expected_synced: input.expectedSynced,
    p_expected_adjustment: input.expectedAdjustment,
    p_reason: reason,
  }
  const { error } = Object.keys(writes).length > 0
    ? await supabase.rpc('save_revenue_payroll_row', { ...args, p_row_updates: writes })
    : await supabase.rpc('adjust_revenue_payroll_commission', args)
  if (error) throw new Error(error.message)

  revalidatePath('/hr-costing/payroll', 'layout')
  revalidatePath('/hr-costing/payment', 'layout')
  revalidatePath('/revenue', 'layout')
  revalidatePath('/hr-costing')
}
