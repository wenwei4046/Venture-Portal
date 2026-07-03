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
  designation: string | null
  basic_salary: number
}

export interface StaffUpdateItem extends StaffPreviewItem {
  staffId: string
  changes: Array<{ field: string; from: string; to: string }>
}

export interface StaffPreviewResult {
  toCreate: StaffPreviewItem[]
  /** Existing staff (matched by employee_code) whose master fields will be
   *  synced to the file. Re-import is the contract update path (user decision
   *  2026-06-05 — supersedes the old skip-as-duplicate behaviour). */
  toUpdate: StaffUpdateItem[]
  /** Existing staff whose file row matches the DB exactly — nothing to do. */
  unchanged: Array<{
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
      .select('id, employee_code, employee_name, department_id, designation, basic_salary, hire_date, nric, bank_name, bank_account_no')
      .not('employee_code', 'is', null),
    // is_internal=false — the 'Venture Office' pseudo-dept is not a staff dept.
    supabase.from('departments').select('id, name').eq('is_internal', false),
  ])

  const existingByCode = new Map(
    (existing ?? [])
      .filter(s => s.employee_code)
      .map(s => [s.employee_code as string, s]),
  )
  const deptByName = new Map(
    (departments ?? []).map(d => [d.name.toLowerCase(), d.id]),
  )

  const result: StaffPreviewResult = {
    toCreate: [],
    toUpdate: [],
    unchanged: [],
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
    const deptId = mappedDeptName ? deptByName.get(mappedDeptName.toLowerCase()) : undefined
    if (!mappedDeptName || !deptId) {
      result.deptMissing.push({
        rowIndex: idx,
        employee_code: row.employeeCode,
        employee_name: row.employeeName,
        dept_code: row.deptCode,
      })
      return
    }

    const current = existingByCode.get(row.employeeCode)
    if (current) {
      // Existing staff — diff the master fields against the file and sync.
      const incomingNric = row.nric ? row.nric.replace(/[-\s]/g, '') : null
      const incomingBank = row.bankCode ? BANK_CODES[row.bankCode] ?? row.bankCode : null
      const diffs: Array<{ field: string; from: string; to: string }> = []
      const compare = (field: string, from: unknown, to: unknown) => {
        const f = from == null || from === '' ? null : String(from)
        const t = to == null || to === '' ? null : String(to)
        if (f !== t) diffs.push({ field, from: f ?? '—', to: t ?? '—' })
      }
      compare('employee_name', current.employee_name, row.employeeName)
      compare('department', current.department_id, deptId)
      compare('designation', current.designation, row.designation)
      compare('basic_salary', Number(current.basic_salary).toFixed(2), row.basicSalary.toFixed(2))
      compare('hire_date', current.hire_date, row.hireDate)
      compare('nric', current.nric, incomingNric)
      compare('bank_name', current.bank_name, incomingBank)
      compare('bank_account_no', current.bank_account_no, row.bankAccountNo)

      if (diffs.length === 0) {
        result.unchanged.push({
          rowIndex: idx,
          employee_code: row.employeeCode,
          employee_name: row.employeeName,
        })
        return
      }

      result.toUpdate.push({
        rowIndex: idx,
        staffId: current.id,
        employee_code: row.employeeCode,
        employee_name: row.employeeName,
        dept_code: row.deptCode,
        dept_name_portal: mappedDeptName,
        designation: row.designation,
        basic_salary: row.basicSalary,
        changes: diffs,
      })
      return
    }

    result.toCreate.push({
      rowIndex: idx,
      employee_code: row.employeeCode,
      employee_name: row.employeeName,
      dept_code: row.deptCode,
      dept_name_portal: mappedDeptName,
      designation: row.designation,
      basic_salary: row.basicSalary,
    })
  })

  return result
}

export async function applyInfotechStaffImport(
  rows: InfotechStaffRow[],
): Promise<{
  created: number
  updated: number
  unchanged: number
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
    .eq('is_internal', false)
  const deptByName = new Map(
    (departments ?? []).map(d => [d.name.toLowerCase(), d.id]),
  )

  let created = 0
  let updated = 0
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
      designation: src.designation,
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

  // Sync existing staff to the file — InfoTech is the contract master
  // (user decision 2026-06-05).
  for (const pending of preview.toUpdate) {
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

    const { error } = await supabase
      .from('hr_staff_costs')
      .update({
        employee_name: src.employeeName,
        department_id: deptId,
        designation: src.designation,
        basic_salary: src.basicSalary,
        hire_date: src.hireDate,
        nric,
        bank_name: bankName,
        bank_account_no: src.bankAccountNo,
      })
      .eq('id', pending.staffId)

    if (error) {
      failed.push({
        rowIndex: pending.rowIndex,
        employee_code: src.employeeCode,
        reason: error.message,
      })
    } else {
      updated++
    }
  }

  revalidatePath('/hr-costing', 'layout')

  return {
    created,
    updated,
    unchanged: preview.unchanged.length,
    directors: preview.directors.length,
    deptMissing: preview.deptMissing.length,
    failed,
  }
}
