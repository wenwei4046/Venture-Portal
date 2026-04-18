'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import type { InfotechStaffRow } from '@/lib/import/infotech-staff'

/**
 * InfoTech department code → portal department name.
 * H-DRT (Director) is intentionally excluded — directors are managed via the
 * Director Salary module which writes its own hr_monthly_payroll rows on
 * "Save and Calculate". Importing them here would clash with that flow.
 */
const DEPT_CODE_MAP: Record<string, string> = {
  'H-DO': 'Director Office',
  'H-FIN': 'Finance',
  'H-HR': 'HR',
  'H-MK': 'Marketing',
}

/** InfoTech's internal bank codes observed in HVenture payroll data. */
const BANK_CODES: Record<string, string> = {
  '7725': 'AmBank',
  '7747': 'Hong Leong Bank',
  '7766': 'Public Bank',
  '7798': 'Maybank',
  '7830': 'CIMB',
  '7832': 'RHB',
  '7844': 'Alliance Bank',
}

const DIRECTOR_DEPT_CODE = 'H-DRT'

export interface StaffPreviewItem {
  rowIndex: number
  employee_code: string
  employee_name: string
  dept_code: string
  dept_name_portal: string
  basic_salary: number
}

export interface StaffPreviewResult {
  toCreate: StaffPreviewItem[]
  duplicates: Array<{
    rowIndex: number
    employee_code: string
    employee_name: string
  }>
  directors: Array<{
    rowIndex: number
    employee_code: string
    employee_name: string
  }>
  deptMissing: Array<{
    rowIndex: number
    employee_code: string
    employee_name: string
    dept_code: string
  }>
  skipped: Array<{ rowIndex: number; reason: string }>
}

export async function previewInfotechStaffImport(
  rows: InfotechStaffRow[],
): Promise<StaffPreviewResult> {
  await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  const [{ data: existing }, { data: departments }] = await Promise.all([
    supabase
      .from('hr_staff_costs')
      .select('employee_code')
      .not('employee_code', 'is', null),
    supabase.from('departments').select('id, name'),
  ])

  const existingCodes = new Set(
    (existing ?? []).map(s => s.employee_code).filter(Boolean) as string[],
  )
  const deptByName = new Map(
    (departments ?? []).map(d => [d.name.toLowerCase(), d.id]),
  )

  const result: StaffPreviewResult = {
    toCreate: [],
    duplicates: [],
    directors: [],
    deptMissing: [],
    skipped: [],
  }

  rows.forEach((row, idx) => {
    // Directors are managed in Director Salary, not imported here.
    if (row.deptCode === DIRECTOR_DEPT_CODE) {
      result.directors.push({
        rowIndex: idx,
        employee_code: row.employeeCode,
        employee_name: row.employeeName,
      })
      return
    }

    const mappedDeptName = DEPT_CODE_MAP[row.deptCode]
    if (!mappedDeptName || !deptByName.has(mappedDeptName.toLowerCase())) {
      result.deptMissing.push({
        rowIndex: idx,
        employee_code: row.employeeCode,
        employee_name: row.employeeName,
        dept_code: row.deptCode,
      })
      return
    }

    if (existingCodes.has(row.employeeCode)) {
      result.duplicates.push({
        rowIndex: idx,
        employee_code: row.employeeCode,
        employee_name: row.employeeName,
      })
      return
    }

    result.toCreate.push({
      rowIndex: idx,
      employee_code: row.employeeCode,
      employee_name: row.employeeName,
      dept_code: row.deptCode,
      dept_name_portal: mappedDeptName,
      basic_salary: row.basicSalary,
    })
  })

  return result
}

export async function applyInfotechStaffImport(
  rows: InfotechStaffRow[],
): Promise<{
  created: number
  duplicates: number
  directors: number
  deptMissing: number
  failed: Array<{ rowIndex: number; employee_code: string; reason: string }>
}> {
  const user = await requireRole(['hr', 'principal'])
  const supabase = await createClient()
  const preview = await previewInfotechStaffImport(rows)

  const { data: departments } = await supabase
    .from('departments')
    .select('id, name')
  const deptByName = new Map(
    (departments ?? []).map(d => [d.name.toLowerCase(), d.id]),
  )

  let created = 0
  const failed: Array<{ rowIndex: number; employee_code: string; reason: string }> = []

  for (const pending of preview.toCreate) {
    const src = rows[pending.rowIndex]
    const deptId = deptByName.get(pending.dept_name_portal.toLowerCase())
    if (!deptId) {
      failed.push({
        rowIndex: pending.rowIndex,
        employee_code: src.employeeCode,
        reason: 'department disappeared between preview and apply',
      })
      continue
    }

    const nric = src.nric ? src.nric.replace(/[-\s]/g, '') : null
    const bankName = src.bankCode
      ? BANK_CODES[src.bankCode] ?? src.bankCode
      : null

    const { error } = await supabase.from('hr_staff_costs').insert({
      employee_name: src.employeeName,
      employee_code: src.employeeCode,
      department_id: deptId,
      basic_salary: src.basicSalary,
      allowances: 0,
      non_statutory_allowance: 0,
      hire_date: src.hireDate,
      nric,
      bank_name: bankName,
      bank_account_no: src.bankAccountNo,
      created_by: user.id,
    })

    if (error) {
      failed.push({
        rowIndex: pending.rowIndex,
        employee_code: src.employeeCode,
        reason: error.message,
      })
    } else {
      created++
    }
  }

  revalidatePath('/hr-costing', 'layout')

  return {
    created,
    duplicates: preview.duplicates.length,
    directors: preview.directors.length,
    deptMissing: preview.deptMissing.length,
    failed,
  }
}
