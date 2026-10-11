'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn, requirePermission } from '@/lib/auth'
import type { InfotechStaffRow } from '@/lib/import/infotech-staff'
import { buildStaffMatcher } from '@/lib/import/staff-match'
import { bankNameFromCode } from '@/lib/banks'
import { readStaffPrivate } from '@/lib/private-fields'
import { sees } from '@/lib/sensitive'

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
  'H-IT': 'IT',
  'H-MK': 'Marketing',
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
  /** Existing staff — matched on InfoTech's number (`infotech_code`) first,
   *  the name second, never on the portal's own HV code (2026-09-12,
   *  `lib/import/staff-match.ts`) — whose master fields will be synced to
   *  the file. Re-import is the contract update path (user decision
   *  2026-06-05 — supersedes the old skip-as-duplicate behaviour). Somebody
   *  matched by name has the file's number written as their `infotech_code`,
   *  so the next file finds them by it. */
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
  const viewer = await requirePermission('team')
  // The file's NRICs, account numbers and pay are compared and written as
  // they are (2026-10-09, PR4): all three ticks, or no import — the import
  // page says so before anybody gets here.
  if (!sees(viewer, 'nric') || !sees(viewer, 'bank') || !sees(viewer, 'salary')) {
    throw new Error('The InfoTech import needs Salary amounts, NRIC / IC and Bank accounts ticked for your title.')
  }
  const supabase = await createClient()

  const [{ data: rows0 }, { data: departments }, privateFields] = await Promise.all([
    // Everybody, whatever their status and whether or not they carry a
    // number yet: a name is the fallback key, and somebody who left may be
    // back on the list.
    supabase
      .from('hr_staff_costs')
      .select('id, infotech_code, employee_name, department_id, designation, basic_salary, hire_date, bank_name'),
    // is_internal=false — the 'Venture Office' pseudo-dept is not a staff dept.
    supabase.from('departments').select('id, name').eq('is_internal', false),
    // Their NRIC and account number, through the reader — the table no longer
    // hands them out.
    readStaffPrivate(supabase, viewer, null),
  ])
  const existing = (rows0 ?? []).map(r => {
    const priv = privateFields.get(r.id)
    return { ...r, nric: priv?.nric ?? null, bank_account_no: priv?.bank_account_no ?? null }
  })

  const match = buildStaffMatcher(existing)
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

    const found = match(row)
    // A conflict — a shared name, or a known person under a different
    // number — is nobody's to guess: not an update, and not a new person
    // either. It goes to the list somebody reads.
    if (!found.staff && found.miss !== 'none') {
      result.skipped.push({ rowIndex: idx, reason: found.reason })
      return
    }
    const current = found.staff
    if (current) {
      // Existing staff — diff the master fields against the file and sync.
      const incomingNric = row.nric ? row.nric.replace(/[-\s]/g, '') : null
      const incomingBank = bankNameFromCode(row.bankCode)
      const diffs: Array<{ field: string; from: string; to: string }> = []
      const compare = (field: string, from: unknown, to: unknown) => {
        const f = from == null || from === '' ? null : String(from)
        const t = to == null || to === '' ? null : String(to)
        if (f !== t) diffs.push({ field, from: f ?? '—', to: t ?? '—' })
      }
      // First, so a name-only match shows the number about to be learnt.
      compare('infotech_code', current.infotech_code, row.employeeCode)
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
  const user = await requireActionOn('/team/people/import', 'team', 'create')
  const supabase = await createClient()
  const preview = await previewInfotechStaffImport(rows)

  const { data: departments } = await supabase
    .from('departments')
    .select('id, name, payroll_source')
    .eq('is_internal', false)
  const deptByName = new Map(
    (departments ?? []).map(d => [d.name.toLowerCase(), d.id]),
  )
  const commissionDepts = new Set(
    (departments ?? [])
      .filter(d => (d as { payroll_source?: string }).payroll_source === 'commission')
      .map(d => d.id),
  )

  // Everybody's reporting line, read once.
  //
  // This import is the only bulk writer of `department_id`, and it does not
  // touch `reports_to` at all — so it is the one path that can leave a line
  // crossing a commission department's edge WITHOUT ever drawing a line. The
  // rule is in `lib/hierarchy-boundary.ts`; the check below refuses the row
  // rather than clearing somebody's manager on InfoTech's say-so.
  //
  // Neither `hr_staff_costs` trigger fires on a department-only UPDATE (both
  // are `UPDATE OF reports_to, title_id`), so there is no backstop under this.
  const { data: lines } = await supabase.from('hr_staff_costs').select('id, reports_to')
  const managerOf = new Map<string, string | null>()
  const hasReports = new Set<string>()
  for (const line of (lines ?? []) as Array<{ id: string; reports_to: string | null }>) {
    managerOf.set(line.id, line.reports_to)
    if (line.reports_to) hasReports.add(line.reports_to)
  }

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
    const bankName = bankNameFromCode(src.bankCode)

    // The file's code is InfoTech's number and is kept as such; the
    // portal's own `employee_code` is handed out by the database on insert
    // (HV + the largest number + 1, trigger `hr_staff_costs_assign_code`).
    const { error } = await supabase.from('hr_staff_costs').insert({
      employee_name: src.employeeName,
      infotech_code: src.employeeCode,
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

    // A department change that crosses the commission edge, for somebody who
    // is attached to the reporting tree. `changes` carries the department ids
    // themselves — `compare('department', current.department_id, deptId)` —
    // so the old side is read straight off the preview.
    const deptChange = pending.changes.find(c => c.field === 'department')
    if (
      deptChange &&
      commissionDepts.has(deptChange.from) !== commissionDepts.has(deptId) &&
      (managerOf.get(pending.staffId) || hasReports.has(pending.staffId))
    ) {
      failed.push({
        rowIndex: pending.rowIndex,
        employee_code: src.employeeCode,
        reason:
          'their department change crosses a commission department’s edge while they are still on the reporting tree — inside such a department the reporting line is also the commission upline, so clear their line on Staff Hierarchy first and re-run this row',
      })
      continue
    }

    const nric = src.nric ? src.nric.replace(/[-\s]/g, '') : null
    const bankName = bankNameFromCode(src.bankCode)

    const { error } = await supabase
      .from('hr_staff_costs')
      .update({
        // Learnt here when the row was matched by name; a no-op otherwise.
        infotech_code: src.employeeCode,
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
