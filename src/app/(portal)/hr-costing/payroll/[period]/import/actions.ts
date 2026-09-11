'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { assertPeriodOpen } from '@/lib/period-lock'
import type { InfotechRow } from '@/lib/import/infotech-payroll'
import { buildStaffMatcher, type StaffMatchedBy } from '@/lib/import/staff-match'

export interface PreviewResult {
  /** Matched staff whose period row will be overwritten with the file's figures. */
  toUpdate: Array<{
    rowIndex: number
    staffId: string
    staffName: string
    matchedBy: StaffMatchedBy
    gross: number
    net: number
  }>
  /** Matched staff with no payroll row yet — a row is created from the file. */
  toCreate: Array<{
    rowIndex: number
    staffId: string
    staffName: string
    matchedBy: StaffMatchedBy
    gross: number
    net: number
  }>
  skipped: Array<{ rowIndex: number; reason: string; code: string; name: string }>
}

/**
 * Dry-run the InfoTech import: match each row to a staff record and report
 * what will be written. Verbatim import (user decision 2026-06-05): the file
 * is the single source of truth — basic, OT, allowance, bonus, EPF/SOCSO/EIS
 * ER+EE, PCB, gross and net are ALL written exactly as exported. The system
 * does NOT recompute statutory on import. Editing an input field on the grid
 * later still re-triggers the JADUAL recompute for that row.
 *
 * A row is matched on InfoTech's number (`infotech_code`) first and on the
 * name second — `lib/import/staff-match.ts`. Never on `employee_code`: since
 * 2026-09-12 that is the portal's own HV sequence, and an old file's HV013
 * is not the portal's HV013. This import only reads the number; the
 * employee-list import is the one that learns it.
 *
 * Rows are CREATED when the staff has no hr_monthly_payroll row for the
 * period yet — no need to pre-generate the period before importing.
 *
 * Directors (no staff match — they're excluded from the staff master by
 * design) land in `skipped`.
 */
export async function previewInfotechImport(
  rows: InfotechRow[],
  period: string,
): Promise<PreviewResult> {
  await requirePermission('hr_costing')
  const supabase = await createClient()

  const [{ data: staffList, error: staffError }, { data: payroll, error: payrollError }] = await Promise.all([
    supabase
      .from('hr_staff_costs')
      .select('id, employee_name, infotech_code, departments(payroll_source)')
      .eq('status', 'active'),
    supabase
      .from('hr_monthly_payroll')
      .select('id, staff_id, status, source')
      .eq('period_month', period),
  ])
  if (staffError || payrollError) throw new Error(`Could not check import: ${staffError?.message ?? payrollError?.message}`)

  const staff = staffList ?? []
  const payrollByStaff = new Map((payroll ?? []).map(p => [p.staff_id, p]))
  const match = buildStaffMatcher(staff)

  const toUpdate: PreviewResult['toUpdate'] = []
  const toCreate: PreviewResult['toCreate'] = []
  const skipped: PreviewResult['skipped'] = []

  rows.forEach((row, idx) => {
    const code = row.employeeCode
    const name = row.employeeName

    const found = match(row)
    if (!found.staff) {
      skipped.push({ rowIndex: idx, reason: found.reason, code, name })
      return
    }
    const matched = found.staff
    const matchedBy = found.matchedBy

    const existing = payrollByStaff.get(matched.id)
    if (existing?.source === 'commission' || matched.departments?.payroll_source === 'commission') {
      skipped.push({ rowIndex: idx, reason: 'Synced from Revenue Commission Calculation — no InfoTech import needed', code, name })
      return
    }
    if (existing && existing.status !== 'draft') {
      skipped.push({
        rowIndex: idx,
        reason: `Payroll row is ${existing.status} — reopen the run first`,
        code,
        name,
      })
      return
    }

    const target = {
      rowIndex: idx,
      staffId: matched.id,
      staffName: matched.employee_name,
      matchedBy,
      // Show what will be WRITTEN: our gross is after-deduction (file Gross − Ded)
      gross: row.gross - row.deduction,
      net: row.net,
    }
    if (existing) toUpdate.push(target)
    else toCreate.push(target)
  })

  return { toUpdate, toCreate, skipped }
}

/**
 * Apply the import. Re-runs the preview against the live DB (guards against
 * stale client state), then writes each row in two phases:
 *
 *   Phase 1 — input fields (basic/OT/allowance/bonus). This FIRES the compute
 *     trigger, which recomputes statutory from the JADUAL tables — we let it,
 *     then immediately overwrite.
 *   Phase 2 — verbatim figures (EPF/SOCSO/EIS ER+EE, PCB, gross, net). These
 *     columns are NOT in the trigger's UPDATE OF list, so the values stick.
 *     Stamped statutory_overridden_at/by — same convention as the manual
 *     payslip statutory editor, so the grid shows these as file/manual values.
 *
 * unpaid_leave_days is reset to 0: the file's gross/net already reflect any
 * No Pay amount, so converting it to days would double-count.
 *
 * deduction_amount is auto-detected from the file's "Ded" column (2026-07-02):
 * InfoTech's Gross is BEFORE Ded while NettWgs is AFTER, but our schema's
 * gross is after-deduction (so the run's CTC excludes withheld pay). Phase 1
 * writes deduction_amount; phase 2 writes gross = file Gross − Ded and
 * net = file NettWgs unchanged.
 *
 * skbbk_amount is auto-detected from the file's "SKBBK" column (2026-07-03):
 * a net-only employee deduction — NettWgs is already after it, so only the
 * stored amount is new; gross/statutory are untouched.
 */
export async function applyInfotechImport(
  rows: InfotechRow[],
  period: string,
): Promise<{ updated: number; created: number; skipped: number; failed: number }> {
  const user = await requirePermission('hr_costing')
  const supabase = await createClient()
  await assertPeriodOpen(supabase, period)
  const preview = await previewInfotechImport(rows, period)

  let updated = 0
  let created = 0
  let failed = 0
  const overrideStamp = {
    statutory_overridden_at: new Date().toISOString(),
    statutory_overridden_by: user.id,
  }

  const writeVerbatim = async (staffId: string, row: InfotechRow) => {
    const { data, error } = await supabase
      .from('hr_monthly_payroll')
      .update({
        epf_er: row.epfEr,
        epf_ee: row.epfEe,
        socso_er: row.socsoEr,
        socso_ee: row.socsoEe,
        eis_er: row.eisEr,
        eis_ee: row.eisEe,
        pcb: row.pcb,
        gross: row.gross - row.deduction,
        net: row.net,
        ...overrideStamp,
      })
      .eq('staff_id', staffId)
      .eq('period_month', period)
      .eq('status', 'draft')
      .eq('source', 'imported')
      .select('id')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error('Payroll changed while importing. Refresh the preview before retrying.')
  }

  for (const item of preview.toCreate) {
    const row = rows[item.rowIndex]
    // Insert fires the compute trigger (prorata/statutory) — phase 2 then
    // overwrites every computed figure with the file's values.
    const { error: insErr } = await supabase.from('hr_monthly_payroll').insert({
      staff_id: item.staffId,
      period_month: period,
      basic_salary: row.basicSalary,
      ot_amount: row.otAmount,
      non_statutory_allowance: row.nonStatutoryAllowance,
      commission_amount: row.bonus,
      unpaid_leave_days: 0,
      deduction_amount: row.deduction,
      skbbk_amount: row.skbbk,
      source: 'imported',
      status: 'draft',
    })
    if (insErr) {
      failed++
      continue
    }
    try {
      await writeVerbatim(item.staffId, row)
      created++
    } catch {
      failed++
    }
  }

  for (const item of preview.toUpdate) {
    const row = rows[item.rowIndex]
    const { data: updatedRow, error: updErr } = await supabase
      .from('hr_monthly_payroll')
      .update({
        basic_salary: row.basicSalary,
        ot_amount: row.otAmount,
        non_statutory_allowance: row.nonStatutoryAllowance,
        commission_amount: row.bonus,
        unpaid_leave_days: 0,
        deduction_amount: row.deduction,
        skbbk_amount: row.skbbk,
        source: 'imported',
      })
      .eq('staff_id', item.staffId)
      .eq('period_month', period)
      .eq('status', 'draft')
      .neq('source', 'commission')
      .select('id')
      .maybeSingle()
    if (updErr || !updatedRow) {
      failed++
      continue
    }
    try {
      await writeVerbatim(item.staffId, row)
      updated++
    } catch {
      failed++
    }
  }

  revalidatePath(`/hr-costing/payroll/${period}`)
  return { updated, created, skipped: preview.skipped.length, failed }
}
