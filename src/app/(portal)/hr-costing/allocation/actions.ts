'use server'

import { revalidatePath } from 'next/cache'
import dayjs from 'dayjs'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'
import { assertPeriodOpen } from '@/lib/period-lock'
import { isTopupKind, type RowStatus } from '@/lib/payroll-lifecycle'
import { centralizedSplitMessage, costModelOf } from '@/lib/department-mode'
import {
  planSplitCopy,
  splitLock,
  splitLockMessage,
  validateAllocationRows,
  type AllocationRow,
  type SplitStanding,
} from '@/lib/staff-allocation'

// ─── Save one staff member's billing allocation for a period (HR) ────────────
//
// Replaces the staff's row set wholesale: delete existing rows for
// (staff, period) then insert the new ones. Percentages arrive as 0–100 form
// values and are stored as 0–1 fractions (hr_staff_allocation.allocation_pct,
// DECIMAL(7,6)). The unallocated remainder is HV's own share — not stored,
// never billed. RLS: writes are HR + Principal (unified portal 2026-07-16).
//
// The split follows the person's payroll row (2026-09-30): it changes only
// while that row is a draft, never in a month Closed for good. Refused here
// in the words the database uses (guard_staff_allocation_follows_payroll),
// which refuses the same. The refusal is RETURNED, not thrown: a page opened
// before somebody was Completed still offers Save, and production hides a
// thrown message behind a digest — this one tells HR where to go instead.

export type SaveSplitResult = { ok: true } | { ok: false; reason: string }

export async function saveStaffAllocation(
  staffId: string,
  periodMonth: string,
  rows: AllocationRow[],
): Promise<SaveSplitResult> {
  const user = await requireActionOn('/hr-costing/allocation', 'hr_costing', 'edit')
  const supabase = await createClient()

  if (!staffId) throw new Error('Staff id is required')
  const period = dayjs(periodMonth).startOf('month').format('YYYY-MM-DD')
  const monthLabel = dayjs(period).format('MMMM YYYY')

  await assertPeriodOpen(supabase, period)

  const check = validateAllocationRows(rows)
  if (!check.ok) throw new Error(check.error)

  const [{ data: payrollRow, error: rowErr }, { data: monthClosed, error: closedErr }] =
    await Promise.all([
      supabase
        .from('hr_monthly_payroll')
        .select(
          'status, source, completed_at, topup_opened_at, topup_kind, hr_staff_costs (employee_name, departments (name, payroll_source, cost_model))',
        )
        .eq('staff_id', staffId)
        .eq('period_month', period)
        .maybeSingle(),
      supabase.rpc('payroll_month_closed', { p_period: period }),
    ])
  if (rowErr) throw new Error(`Failed to read their payroll: ${rowErr.message}`)
  if (closedErr) throw new Error(`Failed to read whether the month is closed: ${closedErr.message}`)
  if (!payrollRow) {
    return { ok: false, reason: `They are not on ${monthLabel} payroll any more — refresh the page` }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sc = (payrollRow as any).hr_staff_costs
  const lock = splitLock({
    status: payrollRow.status as RowStatus,
    revenue:
      payrollRow.source === 'commission' || sc?.departments?.payroll_source === 'commission',
    completedAt: payrollRow.completed_at,
    topupOpenedAt: payrollRow.topup_opened_at,
    topupKind: isTopupKind(payrollRow.topup_kind) ? payrollRow.topup_kind : null,
    monthClosed: monthClosed === true,
  })
  if (lock.locked) {
    return { ok: false, reason: splitLockMessage(sc?.employee_name ?? 'This person', monthLabel, lock) }
  }
  // A centralized department bills by invoice (2026-09-30): a split left over
  // from before may be cleared, never written.
  if (rows.length > 0 && costModelOf(sc?.departments?.cost_model) === 'centralized') {
    return {
      ok: false,
      reason: centralizedSplitMessage(sc?.departments?.name ?? 'Their department', sc?.employee_name ?? 'this person'),
    }
  }

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
  return { ok: true }
}

// ─── Copy last month's allocations into this period (HR) ─────────────────────
//
// Only fills staff who have NO rows in the target period yet — never
// overwrites what's already entered this month — and, since 2026-09-30, only
// people on this month's payroll whose split can still change: somebody
// Completed / with Finance / paid keeps the split they left with, somebody in
// a centralized department is billed by invoice instead, and somebody who
// left has no payroll row to split.

export async function copyAllocationsFromLastMonth(periodMonth: string): Promise<{
  copiedStaff: number
  lockedStaff: number
  centralizedStaff: number
  notOnPayrollStaff: number
}> {
  const user = await requireActionOn('/hr-costing/allocation', 'hr_costing', 'edit')
  const supabase = await createClient()

  const period = dayjs(periodMonth).startOf('month').format('YYYY-MM-DD')
  const prevPeriod = dayjs(period).subtract(1, 'month').format('YYYY-MM-DD')

  await assertPeriodOpen(supabase, period)

  const [
    { data: prevRows, error: prevErr },
    { data: currentRows, error: curErr },
    { data: payrollRows, error: payErr },
    { data: monthClosed, error: closedErr },
  ] = await Promise.all([
    supabase
      .from('hr_staff_allocation')
      .select('staff_id, company_id, allocation_pct')
      .eq('period_month', prevPeriod)
      .gt('allocation_pct', 0),
    supabase
      .from('hr_staff_allocation')
      .select('staff_id')
      .eq('period_month', period),
    supabase
      .from('hr_monthly_payroll')
      .select('staff_id, status, hr_staff_costs (departments (cost_model))')
      .eq('period_month', period),
    supabase.rpc('payroll_month_closed', { p_period: period }),
  ])
  if (prevErr) throw new Error(`Failed to read last month: ${prevErr.message}`)
  if (curErr) throw new Error(`Failed to read current month: ${curErr.message}`)
  if (payErr) throw new Error(`Failed to read this month's payroll: ${payErr.message}`)
  if (closedErr) throw new Error(`Failed to read whether the month is closed: ${closedErr.message}`)

  const standing = new Map<string, SplitStanding>(
    (payrollRows ?? []).map((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const model = costModelOf((r as any).hr_staff_costs?.departments?.cost_model)
      const where: SplitStanding =
        model === 'centralized' ? 'centralized' : monthClosed !== true && r.status === 'draft' ? 'open' : 'locked'
      return [r.staff_id, where]
    }),
  )
  const plan = planSplitCopy(
    prevRows ?? [],
    standing,
    new Set((currentRows ?? []).map((r) => r.staff_id)),
  )

  if (plan.rows.length > 0) {
    const { error: insErr } = await supabase.from('hr_staff_allocation').insert(
      plan.rows.map((r) => ({
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

  return {
    copiedStaff: plan.copied,
    lockedStaff: plan.locked,
    centralizedStaff: plan.centralized,
    notOnPayrollStaff: plan.notOnPayroll,
  }
}
