'use server'

// Director actual payroll (InfoTech import) — mirrors the staff payroll
// import but writes to director_monthly_payroll. Verbatim store, no
// statutory recompute: the file is the source of truth, inline edits are
// manual corrections that stick as typed.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn, requirePermission } from '@/lib/auth'
import { assertPeriodOpen } from '@/lib/period-lock'
import type { InfotechRow } from '@/lib/import/infotech-payroll'
import { matchDirector, normaliseName } from '@/lib/import/director-payroll-match'
import dayjs from 'dayjs'

export interface DirectorPayrollPreview {
  toCreate: Array<{ rowIndex: number; name: string; directorCode: string | null; gross: number; net: number }>
  toUpdate: Array<{ rowIndex: number; name: string; directorCode: string | null; gross: number; net: number }>
  skipped: Array<{ rowIndex: number; reason: string; code: string; name: string }>
}

/**
 * Dry-run: match each file row to a director (fuzzy name) and report what
 * will be written. Unmatched rows still import (director_id NULL) so nothing
 * silently disappears — the grid shows them without an engine comparison.
 * Rows missing a name are skipped (name is the upsert key).
 */
export async function previewDirectorPayrollImport(
  rows: InfotechRow[],
  period: string,
): Promise<DirectorPayrollPreview> {
  await requirePermission('director_salary')
  const supabase = await createClient()
  const periodNorm = dayjs(period).startOf('month').format('YYYY-MM-DD')

  const [{ data: directors }, { data: existing }] = await Promise.all([
    supabase.from('directors').select('id, code, name').eq('status', 'active'),
    supabase
      .from('director_monthly_payroll')
      .select('id, employee_name')
      .eq('period_month', periodNorm),
  ])

  const dirRefs = (directors ?? []).map(d => ({ id: d.id, code: d.code, name: d.name }))
  const existingNames = new Set((existing ?? []).map(e => normaliseName(e.employee_name)))

  const preview: DirectorPayrollPreview = { toCreate: [], toUpdate: [], skipped: [] }

  rows.forEach((row, idx) => {
    if (!row.employeeName) {
      preview.skipped.push({
        rowIndex: idx,
        reason: 'Missing employee name',
        code: row.employeeCode,
        name: row.employeeName,
      })
      return
    }
    const matched = matchDirector(row.employeeName, dirRefs)
    const target = {
      rowIndex: idx,
      name: row.employeeName,
      directorCode: matched?.code ?? null,
      gross: row.gross - row.deduction,
      net: row.net,
    }
    if (existingNames.has(normaliseName(row.employeeName))) preview.toUpdate.push(target)
    else preview.toCreate.push(target)
  })

  return preview
}

/**
 * Apply the import: upsert one row per person on (period_month, employee_name).
 * Everything verbatim; gross is written file-Gross − Ded (same convention as
 * the staff import — our gross is after-deduction).
 */
export async function applyDirectorPayrollImport(
  rows: InfotechRow[],
  period: string,
): Promise<{ created: number; updated: number; skipped: number; failed: number }> {
  const user = await requireActionOn('/director-salary', 'director_salary', 'edit')
  const supabase = await createClient()
  const periodNorm = dayjs(period).startOf('month').format('YYYY-MM-DD')

  await assertPeriodOpen(supabase, periodNorm)

  const preview = await previewDirectorPayrollImport(rows, periodNorm)
  const { data: directors } = await supabase
    .from('directors')
    .select('id, code, name')
    .eq('status', 'active')
  const dirRefs = (directors ?? []).map(d => ({ id: d.id, code: d.code, name: d.name }))

  let created = 0
  let updated = 0
  let failed = 0

  const writeRow = async (item: { rowIndex: number }, isUpdate: boolean) => {
    const row = rows[item.rowIndex]
    const matched = matchDirector(row.employeeName, dirRefs)
    const { error } = await supabase.from('director_monthly_payroll').upsert(
      {
        period_month: periodNorm,
        director_id: matched?.id ?? null,
        employee_code: row.employeeCode,
        employee_name: row.employeeName,
        dept_name: row.department,
        basic_salary: row.basicSalary,
        statutory_allowance: 0,
        non_statutory_allowance: row.nonStatutoryAllowance,
        ot_amount: row.otAmount,
        commission_amount: row.bonus,
        no_pay_amount: row.noPayDeduction,
        deduction_amount: row.deduction,
        skbbk_amount: row.skbbk,
        epf_er: row.epfEr,
        epf_ee: row.epfEe,
        socso_er: row.socsoEr,
        socso_ee: row.socsoEe,
        eis_er: row.eisEr,
        eis_ee: row.eisEe,
        pcb: row.pcb,
        gross: row.gross - row.deduction,
        net: row.net,
        source: 'imported',
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'period_month,employee_name' },
    )
    if (error) {
      failed++
      return
    }
    if (isUpdate) updated++
    else created++
  }

  for (const item of preview.toCreate) await writeRow(item, false)
  for (const item of preview.toUpdate) await writeRow(item, true)

  revalidatePath('/director-salary')
  return { created, updated, skipped: preview.skipped.length, failed }
}

// ─── Inline edit ───────────────────────────────────────────────────────────

const EDITABLE_FIELDS = [
  'basic_salary',
  'statutory_allowance',
  'non_statutory_allowance',
  'ot_amount',
  'commission_amount',
  'no_pay_amount',
  'deduction_amount',
  'skbbk_amount',
  'epf_er',
  'epf_ee',
  'socso_er',
  'socso_ee',
  'eis_er',
  'eis_ee',
  'pcb',
  'gross',
  'net',
] as const
type EditableField = (typeof EDITABLE_FIELDS)[number]

export type DirectorPayrollUpdate = Partial<Record<EditableField, number>>

/**
 * Manual correction — writes exactly what was typed (no recompute; this
 * table is a verbatim record of the InfoTech run). Marks the row 'manual'
 * so the grid can show it diverged from the file.
 */
export async function updateDirectorPayrollRow(id: string, fields: DirectorPayrollUpdate) {
  await requireActionOn('/director-salary', 'director_salary', 'edit')
  const supabase = await createClient()

  const writes: Record<string, number> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (!(EDITABLE_FIELDS as readonly string[]).includes(k)) {
      throw new Error(`Unknown field: ${k}`)
    }
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0) throw new Error(`${k} must be a non-negative number`)
    writes[k] = Math.round(n * 100) / 100
  }
  if (Object.keys(writes).length === 0) throw new Error('No fields provided')

  const { data: row, error: fetchErr } = await supabase
    .from('director_monthly_payroll')
    .select('id, period_month')
    .eq('id', id)
    .single()
  if (fetchErr || !row) throw new Error('Row not found')

  await assertPeriodOpen(supabase, row.period_month)

  const { error } = await supabase
    .from('director_monthly_payroll')
    .update({ ...writes, source: 'manual', updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`Save failed: ${error.message}`)

  revalidatePath('/director-salary')
}

export async function deleteDirectorPayrollRows(ids: string[], period: string) {
  await requireActionOn('/director-salary', 'director_salary', 'edit')
  const supabase = await createClient()
  if (ids.length === 0) throw new Error('No rows selected')

  const periodNorm = dayjs(period).startOf('month').format('YYYY-MM-DD')
  await assertPeriodOpen(supabase, periodNorm)

  const { error } = await supabase
    .from('director_monthly_payroll')
    .delete()
    .in('id', ids)
    .eq('period_month', periodNorm)
  if (error) throw new Error(`Delete failed: ${error.message}`)

  revalidatePath('/director-salary')
}
