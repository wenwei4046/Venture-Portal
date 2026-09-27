'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { checkSavePayLines, type SavePayLinesInput } from '@/lib/revenue-pay-lines'

/**
 * Pay lines (2026-09-27): the edit button on a salesperson's salary preview
 * saves their whole month of lines at once. `revenue_save_pay_lines` does the
 * checking that matters — Principal or HR, the month's payroll still open, the
 * person's payroll row a draft Revenue row, the lines the editor opened still
 * the lines stored — and moves the payroll row's totals in the same
 * transaction. The rules are `lib/revenue-pay-lines.ts`.
 */

export interface SavePayLinesResult {
  earnings: number
  deductions: number
  /** The month's payroll row took the new totals; false while it has none yet (it picks them up when made). */
  payrollUpdated: boolean
}

export async function savePayLines(input: SavePayLinesInput): Promise<SavePayLinesResult> {
  await requirePermission('revenue')
  const save = checkSavePayLines(input)
  const supabase = (await createClient()) as unknown as SupabaseClient

  const { data, error } = await supabase.rpc('revenue_save_pay_lines', {
    p_staff_id: save.staffId,
    p_period: save.period,
    p_lines: save.lines,
    p_seen: save.seen,
  })
  if (error) throw new Error(error.message)

  // The month page, its payslips and HR's payroll grid all read the lines.
  revalidatePath('/revenue', 'layout')
  revalidatePath('/hr-costing/payroll', 'layout')
  const result = (data ?? {}) as { earnings?: number | string; deductions?: number | string; payroll_updated?: boolean }
  return {
    earnings: Number(result.earnings ?? 0),
    deductions: Number(result.deductions ?? 0),
    payrollUpdated: Boolean(result.payroll_updated),
  }
}
