'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

export interface PayrollRowUpdate {
  basic_salary?: number
  statutory_allowance?: number
  non_statutory_allowance?: number
  ot_hours?: number
  ot_amount?: number
  commission_amount?: number
  unpaid_leave_days?: number
}

/**
 * Update one payroll row. The DB trigger recomputes pro-rata + statutory + gross/net.
 * Only allowed while status='draft'.
 */
export async function updatePayrollRow(
  id: string,
  fields: PayrollRowUpdate,
): Promise<void> {
  await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  const { error } = await supabase
    .from('hr_monthly_payroll')
    .update(fields)
    .eq('id', id)
    .eq('status', 'draft')

  if (error) throw new Error(`Failed to update payroll row: ${error.message}`)

  revalidatePath('/hr-costing/payroll', 'layout')
}

/**
 * Create rows for every active staff in the given period.
 * Idempotent — relies on uq_monthly_payroll_staff_period to skip existing.
 * Same behavior as migration 126 backfill, now callable from the UI.
 */
export async function createPayrollPeriod(period: string): Promise<{ created: number }> {
  await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  const { data: staff, error: staffErr } = await supabase
    .from('hr_staff_costs')
    .select('id, basic_salary, allowances')
    .eq('status', 'active')

  if (staffErr) throw new Error(`Failed to read staff: ${staffErr.message}`)
  if (!staff || staff.length === 0) return { created: 0 }

  // Upsert: insert if not exists, ignore if exists
  const rows = staff.map(s => ({
    staff_id: s.id,
    period_month: period,
    basic_salary: s.basic_salary,
    non_statutory_allowance: s.allowances,
    source: 'carried_forward' as const,
    status: 'draft' as const,
  }))

  const { error, count } = await supabase
    .from('hr_monthly_payroll')
    .upsert(rows, { onConflict: 'staff_id,period_month', ignoreDuplicates: true, count: 'exact' })

  if (error) throw new Error(`Failed to create period: ${error.message}`)

  revalidatePath('/hr-costing/payroll')
  return { created: count ?? 0 }
}

/**
 * Copy values from last month's rows into this period's rows.
 * Only affects existing draft rows for p_period — does not create new rows.
 */
export async function copyFromLastMonth(period: string): Promise<{ copied: number }> {
  await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  const periodDate = new Date(period + 'T00:00:00Z')
  const lastMonth = new Date(periodDate)
  lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1)
  const lastPeriod = lastMonth.toISOString().slice(0, 10)

  const { data: prior, error: readErr } = await supabase
    .from('hr_monthly_payroll')
    .select('staff_id, basic_salary, statutory_allowance, non_statutory_allowance, ot_hours, ot_amount, commission_amount, unpaid_leave_days')
    .eq('period_month', lastPeriod)

  if (readErr) throw new Error(`Failed to read prior period: ${readErr.message}`)
  if (!prior || prior.length === 0) return { copied: 0 }

  let copied = 0
  for (const r of prior) {
    const { error } = await supabase
      .from('hr_monthly_payroll')
      .update({
        basic_salary: r.basic_salary,
        statutory_allowance: r.statutory_allowance,
        non_statutory_allowance: r.non_statutory_allowance,
        ot_hours: r.ot_hours,
        ot_amount: r.ot_amount,
        commission_amount: r.commission_amount,
        unpaid_leave_days: r.unpaid_leave_days,
      })
      .eq('staff_id', r.staff_id)
      .eq('period_month', period)
      .eq('status', 'draft')
    if (!error) copied++
  }

  revalidatePath(`/hr-costing/payroll/${period}`)
  return { copied }
}
