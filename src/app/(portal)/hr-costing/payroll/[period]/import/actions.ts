'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import type { InfotechRow } from '@/lib/import/infotech-payroll'

export interface PreviewResult {
  /** Matched staff whose period row will be overwritten with the file's figures. */
  toUpdate: Array<{
    rowIndex: number
    staffId: string
    staffName: string
    matchedBy: 'employee_code' | 'employee_name_fuzzy'
    gross: number
    net: number
  }>
  /** Matched staff with no payroll row yet — a row is created from the file. */
  toCreate: Array<{
    rowIndex: number
    staffId: string
    staffName: string
    matchedBy: 'employee_code' | 'employee_name_fuzzy'
    gross: number
    net: number
  }>
  skipped: Array<{ rowIndex: number; reason: string; code: string; name: string }>
}

function normalise(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Dry-run the InfoTech import: match each row to a staff record and report
 * what will be written. Verbatim import (user decision 2026-06-05): the file
 * is the single source of truth — basic, OT, allowance, bonus, EPF/SOCSO/EIS
 * ER+EE, PCB, gross and net are ALL written exactly as exported. The system
 * does NOT recompute statutory on import. Editing an input field on the grid
 * later still re-triggers the JADUAL recompute for that row.
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

  const [{ data: staffList }, { data: payroll }] = await Promise.all([
    supabase
      .from('hr_staff_costs')
      .select('id, employee_name, employee_code')
      .eq('status', 'active'),
    supabase
      .from('hr_monthly_payroll')
      .select('id, staff_id, status')
      .eq('period_month', period),
  ])

  const staff = staffList ?? []
  const payrollByStaff = new Map((payroll ?? []).map(p => [p.staff_id, p]))
  const staffByCode = new Map(
    staff
      .filter(s => s.employee_code)
      .map(s => [s.employee_code as string, s]),
  )
  const staffByNormName = new Map(staff.map(s => [normalise(s.employee_name), s]))

  const toUpdate: PreviewResult['toUpdate'] = []
  const toCreate: PreviewResult['toCreate'] = []
  const skipped: PreviewResult['skipped'] = []

  rows.forEach((row, idx) => {
    const code = row.employeeCode
    const name = row.employeeName

    let matched: { id: string; employee_name: string } | undefined
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
  const preview = await previewInfotechImport(rows, period)

  let updated = 0
  let created = 0
  let failed = 0
  const overrideStamp = {
    statutory_overridden_at: new Date().toISOString(),
    statutory_overridden_by: user.id,
  }

  const writeVerbatim = async (staffId: string, row: InfotechRow) => {
    const { error } = await supabase
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
    if (error) throw new Error(error.message)
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
    const { error: updErr } = await supabase
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
    if (updErr) {
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
