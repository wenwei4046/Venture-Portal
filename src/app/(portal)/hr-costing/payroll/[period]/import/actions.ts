'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import type { InfotechRow } from '@/lib/import/infotech-payroll'

export interface PreviewResult {
  toUpdate: Array<{
    rowIndex: number
    staffId: string
    staffName: string
    matchedBy: 'employee_code' | 'employee_name_fuzzy'
    changes: Array<{ field: string; from: number; to: number }>
  }>
  skipped: Array<{ rowIndex: number; reason: string; code: string; name: string }>
  /** Count of InfoTech rows that had no actual data to import (all numbers zero). */
  noChangeCount: number
}

function normalise(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Dry-run the InfoTech import: match each row to a staff record, compute the
 * diff against the period's hr_monthly_payroll row, report updates + skips.
 *
 * Fields touched by import (user decision 2026-04-26, Bug 2 option γ+):
 *   ot_amount               ← OT Amt              (col 4)
 *   non_statutory_allowance ← Allowance Add       (col 7)
 *   unpaid_leave_days       ← No Pay (col 8) → days conversion
 *
 * basic_salary is NEVER touched by import. It stays at the contract value
 * from hr_staff_costs (master). Reason: InfoTech "Tot. Sal" (col 3) is
 * the total monthly payable (basic + fixed allowances ± EL deduction),
 * not the contract basic, so writing it back was overwriting good master
 * data with a derived/dynamic value.
 *
 * No Pay → unpaid_leave_days conversion:
 *   days = (noPayDeduction / contract_basic) * days_in_month
 * The DB trigger (mig 122) then applies pro-rata using days_in_month
 * (calendar days), so the round-trip is consistent.
 *
 * DB trigger then recomputes pro-rata + statutory + gross + net.
 */
export async function previewInfotechImport(
  rows: InfotechRow[],
  period: string,
): Promise<PreviewResult> {
  await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  const [{ data: staffList }, { data: payroll }] = await Promise.all([
    supabase
      .from('hr_staff_costs')
      .select('id, employee_name, employee_code, basic_salary')
      .eq('status', 'active'),
    supabase
      .from('hr_monthly_payroll')
      .select('id, staff_id, ot_amount, non_statutory_allowance, unpaid_leave_days')
      .eq('period_month', period),
  ])

  // days_in_month from the period (period is 'YYYY-MM-01').
  // Matches mig 122's EXTRACT(DAY FROM v_period_end) so the round-trip
  // (days → trigger pro-rata → effective basic) stays consistent.
  const periodDate = new Date(period)
  const lastDay = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 0)
  const daysInMonth = lastDay.getDate()

  const staff = staffList ?? []
  const payrollByStaff = new Map((payroll ?? []).map(p => [p.staff_id, p]))
  const staffByCode = new Map(
    staff
      .filter(s => s.employee_code)
      .map(s => [s.employee_code as string, s]),
  )
  const staffByNormName = new Map(staff.map(s => [normalise(s.employee_name), s]))

  const toUpdate: PreviewResult['toUpdate'] = []
  const skipped: PreviewResult['skipped'] = []
  let noChangeCount = 0

  rows.forEach((row, idx) => {
    const code = row.employeeCode
    const name = row.employeeName

    let matched: { id: string; employee_name: string; employee_code: string | null; basic_salary: number } | undefined
    let matchedBy: 'employee_code' | 'employee_name_fuzzy' | null = null

    if (code) {
      const hit = staffByCode.get(code)
      if (hit) {
        matched = hit
        matchedBy = 'employee_code'
      }
    }
    if (!matched && name) {
      const hit = staffByNormName.get(normalise(name))
      if (hit) {
        matched = hit
        matchedBy = 'employee_name_fuzzy'
      }
    }

    if (!matched || !matchedBy) {
      skipped.push({ rowIndex: idx, reason: 'No matching staff', code, name })
      return
    }

    const existing = payrollByStaff.get(matched.id)
    if (!existing) {
      skipped.push({
        rowIndex: idx,
        reason: 'No payroll row for this staff in the period',
        code,
        name,
      })
      return
    }

    // No Pay ($) → unpaid_leave_days conversion. Guard: zero contract basic
    // means we can't divide — skip the leave update for that staff.
    const contractBasic = Number(matched.basic_salary)
    const incomingLeaveDays =
      contractBasic > 0
        ? Math.round((row.noPayDeduction / contractBasic) * daysInMonth * 100) / 100
        : 0

    const changes: Array<{ field: string; from: number; to: number }> = []
    const deltas: Array<{ field: string; incoming: number; current: number }> = [
      { field: 'ot_amount', incoming: row.otAmount, current: Number(existing.ot_amount) },
      { field: 'non_statutory_allowance', incoming: row.nonStatutoryAllowance, current: Number(existing.non_statutory_allowance) },
      { field: 'unpaid_leave_days', incoming: incomingLeaveDays, current: Number(existing.unpaid_leave_days ?? 0) },
    ]
    for (const d of deltas) {
      if (Math.abs(d.incoming - d.current) < 0.005) continue
      changes.push({ field: d.field, from: d.current, to: d.incoming })
    }

    if (changes.length === 0) {
      noChangeCount++
      return
    }

    toUpdate.push({
      rowIndex: idx,
      staffId: matched.id,
      staffName: matched.employee_name,
      matchedBy,
      changes,
    })
  })

  return { toUpdate, skipped, noChangeCount }
}

/**
 * Apply the previewed updates. Re-runs previewInfotechImport to recompute
 * the diff against the live DB (guards against stale client state), then
 * writes each change via a plain UPDATE — RLS + hr_monthly_payroll status
 * gating still applies.
 */
export async function applyInfotechImport(
  rows: InfotechRow[],
  period: string,
): Promise<{ updated: number; skipped: number; noChange: number }> {
  await requireRole(['hr', 'principal'])
  const supabase = await createClient()
  const preview = await previewInfotechImport(rows, period)

  let updated = 0
  for (const item of preview.toUpdate) {
    const fields: Partial<{
      ot_amount: number
      non_statutory_allowance: number
      unpaid_leave_days: number
    }> = {}
    for (const c of item.changes) {
      ;(fields as Record<string, number>)[c.field] = c.to
    }
    const { error } = await supabase
      .from('hr_monthly_payroll')
      .update(fields)
      .eq('staff_id', item.staffId)
      .eq('period_month', period)
      .eq('status', 'draft')
    if (!error) updated++
  }

  revalidatePath(`/hr-costing/payroll/${period}`)
  return { updated, skipped: preview.skipped.length, noChange: preview.noChangeCount }
}
