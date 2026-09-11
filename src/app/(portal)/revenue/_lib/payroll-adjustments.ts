import type { SupabaseClient } from '@supabase/supabase-js'

/** A staff/month payroll read. It never changes a sub-department statement. */
export interface RevenuePayrollAdjustment {
  staffId: string
  syncedAmount: number | null
  adjustmentAmount: number
  reason: string | null
  grossCommission: number
  status: string
  adjustedAt: string | null
  sourceRunCount: number
}

export interface RevenuePayrollAdjustmentRead {
  rows: RevenuePayrollAdjustment[]
  unavailable: boolean
}

function money(value: unknown): number {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) {
    throw new Error('Incomplete payroll adjustment amount')
  }
  return Number(value)
}

/** Use saved final gross; deriving it from this sub-department would double-count adjustments. */
export function normaliseRevenuePayrollAdjustments(raw: unknown): RevenuePayrollAdjustment[] {
  if (!Array.isArray(raw)) throw new Error('Payroll adjustment rows unavailable')
  return raw.map(row => ({
    staffId: String(row.staff_id),
    syncedAmount: row.commission_synced_amount == null ? null : money(row.commission_synced_amount),
    adjustmentAmount: money(row.commission_adjustment_amount),
    reason: row.commission_adjustment_reason?.trim() || null,
    grossCommission: money(row.commission_amount),
    status: String(row.status ?? ''),
    adjustedAt: row.commission_adjusted_at ?? null,
    sourceRunCount: Number(row.source_run_count ?? 0),
  }))
}

export async function readRevenuePayrollAdjustments(
  supabase: SupabaseClient, subDepartmentId: string, period: string, staffId: string | null = null,
): Promise<RevenuePayrollAdjustmentRead> {
  // The narrow RPC enforces Revenue visibility. Never elevate to a service
  // client or read bank/net/statutory fields from the broader payroll table.
  const { data, error } = await supabase.rpc('revenue_payroll_adjustments', {
    p_sub_department_id: subDepartmentId, p_period: period, p_staff_id: staffId,
  })
  if (error) return { rows: [], unavailable: true }
  try {
    return { rows: normaliseRevenuePayrollAdjustments(data), unavailable: false }
  } catch {
    return { rows: [], unavailable: true }
  }
}
