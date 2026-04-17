'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

export type SystemField =
  | 'skip'
  | 'employee_code' // matching only, not written
  | 'employee_name_match' // matching only, not written
  | 'basic_salary'
  | 'statutory_allowance'
  | 'non_statutory_allowance'
  | 'ot_hours'
  | 'ot_amount'
  | 'commission_amount'
  | 'unpaid_leave_days'

export type ColumnMap = Record<string, SystemField>

/**
 * A row from the parsed CSV, keyed by the CSV header name.
 */
export type ParsedRow = Record<string, string>

export interface PreviewResult {
  toUpdate: Array<{
    rowIndex: number
    staffId: string
    staffName: string
    matchedBy: 'employee_code' | 'employee_name_fuzzy'
    changes: Array<{ field: string; from: number; to: number }>
  }>
  skipped: Array<{ rowIndex: number; reason: string; values: Record<string, string> }>
  writableFields: SystemField[]
}

const WRITABLE_FIELDS: SystemField[] = [
  'basic_salary',
  'statutory_allowance',
  'non_statutory_allowance',
  'ot_hours',
  'ot_amount',
  'commission_amount',
  'unpaid_leave_days',
]

function normalise(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Dry-run the import. Matches each CSV row to a staff record, computes the
 * diff against the existing hr_monthly_payroll row for the period, and reports
 * updates vs skipped rows. Does NOT write.
 */
export async function previewImport(
  mapping: ColumnMap,
  rows: ParsedRow[],
  period: string,
): Promise<PreviewResult> {
  await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  const [{ data: staffList }, { data: payroll }] = await Promise.all([
    supabase.from('hr_staff_costs').select('id, employee_name, employee_code').eq('status', 'active'),
    supabase.from('hr_monthly_payroll')
      .select('id, staff_id, basic_salary, statutory_allowance, non_statutory_allowance, ot_hours, ot_amount, commission_amount, unpaid_leave_days')
      .eq('period_month', period),
  ])

  const staff = staffList ?? []
  const payrollByStaff = new Map((payroll ?? []).map(p => [p.staff_id, p]))
  const staffByCode = new Map(
    staff.filter(s => s.employee_code).map(s => [s.employee_code as string, s]),
  )
  const staffByNormName = new Map(staff.map(s => [normalise(s.employee_name), s]))

  const codeCol = Object.entries(mapping).find(([, f]) => f === 'employee_code')?.[0]
  const nameCol = Object.entries(mapping).find(([, f]) => f === 'employee_name_match')?.[0]

  const toUpdate: PreviewResult['toUpdate'] = []
  const skipped: PreviewResult['skipped'] = []

  rows.forEach((row, idx) => {
    let matched: { id: string; employee_name: string; employee_code: string | null } | undefined
    let matchedBy: 'employee_code' | 'employee_name_fuzzy' | null = null

    if (codeCol && row[codeCol]) {
      const code = row[codeCol].trim()
      const hit = staffByCode.get(code)
      if (hit) {
        matched = hit
        matchedBy = 'employee_code'
      }
    }
    if (!matched && nameCol && row[nameCol]) {
      const hit = staffByNormName.get(normalise(row[nameCol]))
      if (hit) {
        matched = hit
        matchedBy = 'employee_name_fuzzy'
      }
    }

    if (!matched || !matchedBy) {
      skipped.push({ rowIndex: idx, reason: 'No matching staff', values: row })
      return
    }

    const existing = payrollByStaff.get(matched.id)
    if (!existing) {
      skipped.push({ rowIndex: idx, reason: 'No payroll row for this staff in the period', values: row })
      return
    }

    const changes: Array<{ field: string; from: number; to: number }> = []
    for (const [csvCol, systemField] of Object.entries(mapping)) {
      if (!WRITABLE_FIELDS.includes(systemField)) continue
      const raw = row[csvCol] ?? ''
      const parsed = parseFloat(raw)
      if (!Number.isFinite(parsed)) continue
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const current = Number((existing as any)[systemField] ?? 0)
      if (Math.abs(parsed - current) < 0.005) continue
      changes.push({ field: systemField, from: current, to: parsed })
    }

    if (changes.length === 0) {
      skipped.push({ rowIndex: idx, reason: 'No changes vs current row', values: row })
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

  return { toUpdate, skipped, writableFields: WRITABLE_FIELDS }
}

/**
 * Apply the previewed updates. Calls updatePayrollRow-equivalent directly —
 * RLS + status='draft' gating still applies.
 */
export async function applyImport(
  mapping: ColumnMap,
  rows: ParsedRow[],
  period: string,
): Promise<{ updated: number; skipped: number }> {
  await requireRole(['hr', 'principal'])
  const supabase = await createClient()
  const preview = await previewImport(mapping, rows, period)

  let updated = 0
  for (const item of preview.toUpdate) {
    const fields: Record<string, number> = {}
    for (const c of item.changes) fields[c.field] = c.to
    const { error } = await supabase
      .from('hr_monthly_payroll')
      .update(fields)
      .eq('staff_id', item.staffId)
      .eq('period_month', period)
      .eq('status', 'draft')
    if (!error) updated++
  }

  revalidatePath(`/hr-costing/payroll/${period}`)
  return { updated, skipped: preview.skipped.length }
}
