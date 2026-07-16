'use server'

import { revalidatePath } from 'next/cache'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { assertPeriodOpen } from '@/lib/period-lock'
import { validateAllocationRows, type AllocationRow } from '@/lib/staff-allocation'

// ─── Save one staff member's billing allocation for a period (HR) ────────────
//
// Replaces the staff's row set wholesale: delete existing rows for
// (staff, period) then insert the new ones. Percentages arrive as 0–100 form
// values and are stored as 0–1 fractions (hr_staff_allocation.allocation_pct,
// DECIMAL(7,6)). The unallocated remainder is HV's own share — not stored,
// never billed. RLS: writes are HR + Principal (unified portal 2026-07-16).

export async function saveStaffAllocation(
  staffId: string,
  periodMonth: string,
  rows: AllocationRow[],
): Promise<void> {
  const user = await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  if (!staffId) throw new Error('Staff id is required')
  const period = dayjs(periodMonth).startOf('month').format('YYYY-MM-DD')

  await assertPeriodOpen(supabase, period)

  const check = validateAllocationRows(rows)
  if (!check.ok) throw new Error(check.error)

  const { error: delErr } = await supabase
    .from('hr_staff_allocation')
    .delete()
    .eq('staff_id', staffId)
    .eq('period_month', period)
  if (delErr) throw new Error(`Failed to clear old allocation: ${delErr.message}`)

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from('hr_staff_allocation').insert(
      rows.map((r) => ({
        staff_id: staffId,
        company_id: r.companyId,
        period_month: period,
        allocation_pct: Math.round(r.pct * 10000) / 1000000, // % → 6dp fraction
        created_by: user.id,
      })),
    )
    if (insErr) throw new Error(`Failed to save allocation: ${insErr.message}`)
  }

  revalidatePath('/hr-costing/allocation', 'layout')
  revalidatePath('/billing')
}

// ─── Copy last month's allocations into this period (HR) ─────────────────────
//
// Only fills staff who have NO rows in the target period yet — never
// overwrites what's already entered this month.

export async function copyAllocationsFromLastMonth(periodMonth: string): Promise<{
  copiedStaff: number
}> {
  const user = await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  const period = dayjs(periodMonth).startOf('month').format('YYYY-MM-DD')
  const prevPeriod = dayjs(period).subtract(1, 'month').format('YYYY-MM-DD')

  await assertPeriodOpen(supabase, period)

  const [{ data: prevRows, error: prevErr }, { data: currentRows, error: curErr }] =
    await Promise.all([
      supabase
        .from('hr_staff_allocation')
        .select('staff_id, company_id, allocation_pct')
        .eq('period_month', prevPeriod)
        .gt('allocation_pct', 0),
      supabase
        .from('hr_staff_allocation')
        .select('staff_id')
        .eq('period_month', period),
    ])
  if (prevErr) throw new Error(`Failed to read last month: ${prevErr.message}`)
  if (curErr) throw new Error(`Failed to read current month: ${curErr.message}`)

  const alreadySet = new Set((currentRows ?? []).map((r) => r.staff_id))
  const toCopy = (prevRows ?? []).filter((r) => !alreadySet.has(r.staff_id))

  if (toCopy.length > 0) {
    const { error: insErr } = await supabase.from('hr_staff_allocation').insert(
      toCopy.map((r) => ({
        staff_id: r.staff_id,
        company_id: r.company_id,
        period_month: period,
        allocation_pct: r.allocation_pct,
        created_by: user.id,
      })),
    )
    if (insErr) throw new Error(`Failed to copy allocations: ${insErr.message}`)
  }

  revalidatePath('/hr-costing/allocation', 'layout')
  revalidatePath('/billing')

  return { copiedStaff: new Set(toCopy.map((r) => r.staff_id)).size }
}
