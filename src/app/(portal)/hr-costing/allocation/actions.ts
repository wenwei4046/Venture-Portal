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
  validateDeptMoves,
  type AllocationRow,
  type DeptMoveRow,
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

// Payroll cost moved to another department (2026-11-03, method B — the user:
// "我说的意思是example 从director office split 薪水去hr, 也要开一张bill"): the
// person's department lines are saved with their company split, under the same
// lock. Sent, they replace the month's lines; not sent (undefined), the lines
// stand — a caller that edits only the companies never wipes them. They are
// written first, so a line the database refuses leaves the company split as it
// was. A centralized person has department lines only.

export async function saveStaffAllocation(
  staffId: string,
  periodMonth: string,
  rows: AllocationRow[],
  moves?: DeptMoveRow[],
): Promise<SaveSplitResult> {
  const user = await requireActionOn('/hr-costing/allocation', 'hr_costing', 'edit')
  const supabase = await createClient()

  if (!staffId) throw new Error('Staff id is required')
  const period = dayjs(periodMonth).startOf('month').format('YYYY-MM-DD')
  const monthLabel = dayjs(period).format('MMMM YYYY')

  await assertPeriodOpen(supabase, period)

  const [{ data: payrollRow, error: rowErr }, { data: monthClosed, error: closedErr }] =
    await Promise.all([
      supabase
        .from('hr_monthly_payroll')
        .select(
          'status, source, completed_at, topup_opened_at, topup_kind, gross, epf_er, socso_er, eis_er, hr_staff_costs (employee_name, department_id, departments (name, payroll_source, cost_model))',
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

  const centralized = costModelOf(sc?.departments?.cost_model) === 'centralized'
  const employerCost =
    Math.round(
      (Number(payrollRow.gross ?? 0) + Number(payrollRow.epf_er ?? 0) + Number(payrollRow.socso_er ?? 0) + Number(payrollRow.eis_er ?? 0)) * 100,
    ) / 100
  let standingMoves: DeptMoveRow[] = moves ?? []
  if (moves === undefined) {
    const { data: current, error: curErr } = await supabase
      .from('hr_staff_dept_moves')
      .select('department_id, amount, pct')
      .eq('staff_id', staffId)
      .eq('period_month', period)
    if (curErr) throw new Error(`Failed to read their department lines: ${curErr.message}`)
    standingMoves = (current ?? []).map((m) =>
      m.pct != null
        ? { departmentId: m.department_id as string, kind: 'pct' as const, value: Number(m.pct) * 100 }
        : { departmentId: m.department_id as string, kind: 'amount' as const, value: Number(m.amount) },
    )
  }
  const check = validateDeptMoves(employerCost, rows, standingMoves, sc?.department_id ?? '', centralized)
  if (!check.ok) return { ok: false, reason: check.error }

  if (moves !== undefined) {
    const { error: movesDelErr } = await supabase
      .from('hr_staff_dept_moves')
      .delete()
      .eq('staff_id', staffId)
      .eq('period_month', period)
    if (movesDelErr) return { ok: false, reason: movesDelErr.message }
    if (moves.length > 0) {
      const { error: movesErr } = await supabase.from('hr_staff_dept_moves').insert(
        moves.map((m) => ({
          staff_id: staffId,
          period_month: period,
          department_id: m.departmentId,
          amount: m.kind === 'amount' ? Math.round(m.value * 100) / 100 : null,
          pct: m.kind === 'pct' ? Math.round(m.value * 10000) / 1000000 : null, // % → 6dp fraction
          created_by: user.id,
        })),
      )
      if (movesErr) return { ok: false, reason: movesErr.message }
    }
  }
  // A centralized person has no company split to write (one left from before
  // was cleared when the department went centralized).
  if (centralized) {
    revalidatePath('/hr-costing/allocation', 'layout')
    revalidatePath('/billing')
    return { ok: true }
  }

  const { error: delErr } = await supabase
    .from('hr_staff_allocation')
    .delete()
    .eq('staff_id', staffId)
    .eq('period_month', period)
  if (delErr) return { ok: false, reason: delErr.message }

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
    if (insErr) return { ok: false, reason: insErr.message }
  }

  revalidatePath('/hr-costing/allocation', 'layout')
  revalidatePath('/billing')
  return { ok: true }
}

// ─── A receiving cost center's Bill to % for the month (HR, 2026-11-03) ──────
//
// What moved into a cost-center department is billed on to the companies by
// its Bill to % (hr_pool_allocation); what it does not bill stays its own cost
// (the user: "也有可能是 hr pool 要承担"). Saved whole for the month. A
// centralized department has none — the database refuses the same, in the
// same words (guard_pool_allocation).

export async function saveDeptBillTo(
  departmentId: string,
  periodMonth: string,
  rows: AllocationRow[],
): Promise<SaveSplitResult> {
  const user = await requireActionOn('/hr-costing/allocation', 'hr_costing', 'edit')
  const supabase = await createClient()
  if (!departmentId) throw new Error('Department id is required')
  const period = dayjs(periodMonth).startOf('month').format('YYYY-MM-DD')
  await assertPeriodOpen(supabase, period)

  const check = validateAllocationRows(rows)
  if (!check.ok) return { ok: false, reason: check.error }

  const { data: dept, error: deptErr } = await supabase
    .from('departments')
    .select('name, cost_model')
    .eq('id', departmentId)
    .maybeSingle()
  if (deptErr) throw new Error(`Failed to read the department: ${deptErr.message}`)
  if (!dept) return { ok: false, reason: 'That department no longer exists — refresh the page' }
  if (costModelOf(dept.cost_model) === 'centralized') {
    return { ok: false, reason: `${dept.name} is centralized — what moves into it is its own cost, billed by its own invoices` }
  }

  const { error: delErr } = await supabase
    .from('hr_pool_allocation')
    .delete()
    .eq('department_id', departmentId)
    .eq('period_month', period)
  if (delErr) return { ok: false, reason: delErr.message }
  if (rows.length > 0) {
    const { error: insErr } = await supabase.from('hr_pool_allocation').insert(
      rows.map((r) => ({
        department_id: departmentId,
        company_id: r.companyId,
        period_month: period,
        split_pct: Math.round(r.pct * 10000) / 1000000, // % → 6dp fraction
        created_by: user.id,
      })),
    )
    if (insErr) return { ok: false, reason: insErr.message }
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

//
// Since 2026-11-03 it also brings last month's department lines, for anybody
// whose row is still a draft and who has none this month — a centralized
// person too (department lines are theirs to have) — and each receiving cost
// center's Bill to %, where it has none this month.

export async function copyAllocationsFromLastMonth(periodMonth: string): Promise<{
  copiedStaff: number
  lockedStaff: number
  centralizedStaff: number
  notOnPayrollStaff: number
  copiedMoves: number
  copiedBillTo: number
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
  const [
    { data: prevMoves, error: prevMovesErr },
    { data: currentMoves, error: curMovesErr },
    { data: prevBillTo, error: prevBillToErr },
    { data: currentBillTo, error: curBillToErr },
    { data: departments, error: deptErr },
  ] = await Promise.all([
    supabase.from('hr_staff_dept_moves').select('staff_id, department_id, amount, pct').eq('period_month', prevPeriod),
    supabase.from('hr_staff_dept_moves').select('staff_id').eq('period_month', period),
    supabase.from('hr_pool_allocation').select('department_id, company_id, split_pct').eq('period_month', prevPeriod).gt('split_pct', 0),
    supabase.from('hr_pool_allocation').select('department_id').eq('period_month', period),
    supabase.from('departments').select('id, cost_model'),
  ])
  if (prevMovesErr) throw new Error(`Failed to read last month's department lines: ${prevMovesErr.message}`)
  if (curMovesErr) throw new Error(`Failed to read this month's department lines: ${curMovesErr.message}`)
  if (prevBillToErr) throw new Error(`Failed to read last month's Bill to: ${prevBillToErr.message}`)
  if (curBillToErr) throw new Error(`Failed to read this month's Bill to: ${curBillToErr.message}`)
  if (deptErr) throw new Error(`Failed to read the departments: ${deptErr.message}`)
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

  // Department lines: any department mode, only while the row can change.
  const movesStanding = new Map<string, SplitStanding>(
    (payrollRows ?? []).map((r) => [r.staff_id, monthClosed !== true && r.status === 'draft' ? 'open' : 'locked']),
  )
  const movesPlan = planSplitCopy(
    prevMoves ?? [],
    movesStanding,
    new Set((currentMoves ?? []).map((r) => r.staff_id)),
  )
  if (movesPlan.rows.length > 0) {
    const { error: movesErr } = await supabase.from('hr_staff_dept_moves').insert(
      movesPlan.rows.map((m) => ({
        staff_id: m.staff_id,
        period_month: period,
        department_id: m.department_id,
        amount: m.amount,
        pct: m.pct,
        created_by: user.id,
      })),
    )
    if (movesErr) throw new Error(`Failed to copy department lines: ${movesErr.message}`)
  }

  // The receivers' Bill to %: a cost center with none this month (never in a month closed for good).
  const centralizedDept = new Set(
    (departments ?? []).filter((d) => costModelOf(d.cost_model) === 'centralized').map((d) => d.id as string),
  )
  const hasBillTo = new Set((currentBillTo ?? []).map((r) => r.department_id as string))
  const billToRows =
    monthClosed === true
      ? []
      : (prevBillTo ?? []).filter((r) => !hasBillTo.has(r.department_id as string) && !centralizedDept.has(r.department_id as string))
  if (billToRows.length > 0) {
    const { error: billToErr } = await supabase.from('hr_pool_allocation').insert(
      billToRows.map((r) => ({
        department_id: r.department_id,
        company_id: r.company_id,
        period_month: period,
        split_pct: r.split_pct,
        created_by: user.id,
      })),
    )
    if (billToErr) throw new Error(`Failed to copy Bill to: ${billToErr.message}`)
  }

  revalidatePath('/hr-costing/allocation', 'layout')
  revalidatePath('/billing')

  return {
    copiedStaff: plan.copied,
    lockedStaff: plan.locked,
    centralizedStaff: plan.centralized,
    notOnPayrollStaff: plan.notOnPayroll,
    copiedMoves: movesPlan.copied,
    copiedBillTo: new Set(billToRows.map((r) => r.department_id as string)).size,
  }
}
