'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'
import { validateStaffForm, designationForTitle, payPatchForUpdate } from '@/lib/staff-form'
import { LOGIN_EMAIL_LOCKED, asksPay, payModeOf } from '@/lib/person-record'
import { moveReportingLine } from '@/lib/hierarchy-writes'
import { saveRecordAndLine } from '@/lib/person-line-save'
import { readStaffPrivate } from '@/lib/private-fields'
import { validateSecondaryStaffBankAccount } from '@/lib/staff-bank-accounts'
import { isMasked, sees } from '@/lib/sensitive'
import { addressRefusal } from '@/lib/address/address'
import { addressFromForm, addressPatch } from '@/lib/address/address-form'
import { MALAYSIA_DATA } from '@/lib/address/malaysia-data'
import type { TablesUpdate } from '@/lib/supabase/database.types'

/**
 * The address a form sent (2026-10-20, its six parts — `lib/address`), checked against Malaysia's postcode list:
 * the columns to write, or null when the form did not carry it. A refusal is a sentence for the screen.
 */
function addressColumns(formData: FormData): Record<string, string | null> | null {
  const address = addressFromForm(formData)
  if (!address) return null
  const refused = addressRefusal(address, MALAYSIA_DATA)
  if (refused) throw new Error(refused)
  return addressPatch(address)
}

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

const str = (formData: FormData, key: string): string | null =>
  typeof formData.get(key) === 'string' ? (formData.get(key) as string) : null

/**
 * Filing a new person.
 *
 * Shape and rules live in lib/staff-form.ts, where they are unit-tested: the
 * "Full commission" tick (a commission department's staff carry no basic and
 * no statutory allowance), the "Variable pay" tick (a director's figure is
 * keyed each month, so no basic either), money that has to be a non-negative
 * number, an account number kept to its digits.
 *
 * A title is a row (2026-09-01), so the chosen one is read back from the
 * table here — it has to exist, be active and fit the department — and
 * `designation`, the free-text column the InfoTech import writes and the
 * payroll export reads, is set to mirror its name.
 *
 * A DIVIDED DEPARTMENT (2026-09-20) is asked one more question: which
 * sub-department the person is based in. Blank means its default, which is
 * what everybody hired before that date got. The reporting line is asked here
 * too, because filing it now is what makes the commission membership the
 * database derives correct on the first write.
 */
export async function addStaff(formData: FormData) {
  const user = await requireActionOn('/team/people/new', 'team', 'create')
  const supabase = await createClient()

  const form = validateStaffForm({
    name: str(formData, 'name'),
    departmentId: str(formData, 'department_id'),
    titleId: str(formData, 'title_id'),
    homeSubDepartmentId: str(formData, 'home_sub_department_id'),
    reportsTo: str(formData, 'reports_to'),
    fullCommission: formData.get('full_commission') === 'on',
    variablePay: formData.get('variable_pay') === 'on',
    basicSalary: str(formData, 'basic_salary'),
    allowances: str(formData, 'allowances'),
    nonStatutoryAllowance: str(formData, 'non_statutory_allowance'),
    bankName: str(formData, 'bank_name'),
    bankAccountNo: str(formData, 'bank_account_no'),
    bankName2: str(formData, 'bank_name_2'),
    bankAccountNo2: str(formData, 'bank_account_no_2'),
    contactNumber: str(formData, 'contact_number'),
    email: str(formData, 'email'),
    emergencyContactName: str(formData, 'emergency_contact_name'),
    emergencyContactPhone: str(formData, 'emergency_contact_phone'),
    emergencyContactRelationship: str(formData, 'emergency_contact_relationship'),
  })

  // The address in its six parts (2026-10-20); the database puts the one-line `address` together from them.
  const address = addressColumns(formData) ?? {}

  let designation: string | null = null
  if (form.titleId) {
    const { data: title } = await supabase
      .from('titles')
      .select('id, name, department_id, is_active')
      .eq('id', form.titleId)
      .maybeSingle()
    designation = designationForTitle(title, form.departmentId)
  }

  const { error } = await supabase.from('hr_staff_costs').insert({
    employee_name: form.name,
    department_id: form.departmentId,
    title_id: form.titleId,
    // Where they are BASED and who they report to (2026-09-20). Both are
    // roster columns with triggers of their own: the base must be an active
    // sub-department of this department whose ladder carries the title
    // (23HOM), and inside a commission department the line may not cross the
    // department's edge (23BND) or land on a title that cannot lead (23REC).
    // Written on the insert so the commission membership the trigger derives
    // is right the first time, rather than created in Fair and moved after.
    home_sub_department_id: form.homeSubDepartmentId,
    reports_to: form.reportsTo,
    designation,
    employment_type: form.employmentType,
    basic_salary: form.basicSalary,
    allowances: form.allowances,
    non_statutory_allowance: form.nonStatutoryAllowance,
    // Only by somebody whose title ticks Bank accounts (2026-10-09, PR4) —
    // the form does not ask anybody else.
    ...(sees(user, 'bank')
      ? {
          bank_name: form.bankName,
          bank_account_no: form.bankAccountNo,
          bank_name_2: form.bankName2,
          bank_account_no_2: form.bankAccountNo2,
        }
      : {}),
    contact_number: form.contactNumber,
    email: form.email,
    ...address,
    emergency_contact_name: form.emergencyContactName,
    emergency_contact_phone: form.emergencyContactPhone,
    emergency_contact_relationship: form.emergencyContactRelationship,
    created_by: user.id,
  })

  if (error) {
    if (error.code === '23505') throw new Error('Employee already exists')
    // A trigger that refused the base or the reporting line wrote a sentence
    // for whoever is at the screen; it is the whole answer, so pass it on.
    if (['23HOM', '23BND', '23REC', '23LAD', '23RNK', '23DIR', '23514'].includes(error.code ?? '')) {
      throw new Error(error.message)
    }
    throw new Error(`Failed to add staff: ${error.message}`)
  }

  revalidatePath('/hr-costing')
  revalidatePath('/team', 'layout')
  revalidatePath('/revenue', 'layout')
}

/**
 * What a save of a person's record answers (2026-10-14). A refusal comes back
 * in words: production hands a thrown message to the browser only as a
 * digest, and the person's page shows the reason in its save bar.
 */
export type StaffSaveOutcome = { ok: true } | { ok: false; reason: string }

/**
 * Saving a person's record — edited where it stands on their full page since
 * 2026-10-14, which is the page this write belongs to.
 */
export async function updateStaff(id: string, formData: FormData): Promise<StaffSaveOutcome> {
  const editor = await requireActionOn('/team/people/[id]', 'team', 'edit')

  // The form writes pay, so it is an editor whose title ticks Salary amounts
  // (2026-10-09, PR4) — anybody else was never shown the figures it saves.
  if (!sees(editor, 'salary')) {
    return { ok: false, reason: 'Editing a person needs Salary amounts ticked for your title — the form saves their pay.' }
  }

  // Reports to (2026-10-16) is saved apart from the record, by the one writer
  // both charts use — the order the two go in is lib/person-line-save.ts's.
  let outcome: StaffSaveOutcome
  try {
    const supabase = await createClient()
    outcome = await saveRecordAndLine({
      lineSent: formData.has('reports_to'),
      titleSent: formData.has('title_id'),
      moveLine: async () => {
        const moved = await moveReportingLine(supabase, id, trimOrNull(formData.get('reports_to')))
        return moved.ok ? { ok: true } : { ok: false, reason: moved.reason }
      },
      writeRecord: () => writeStaff(editor, id, formData),
    })
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'Could not save. Please try again.' }
  }

  // Refused or not, part of it may have been written (a title before a line
  // the database still refused): the pages read again either way.
  revalidatePath('/hr-costing')
  // The org chart draws the title, the ladder rung it stands on and the rank —
  // all three can change here, so the graph is stale until this runs. Its
  // absence was why a title edited on People did not show on Hierarchy until
  // the next hard reload. `/team` holds the person's own page too.
  revalidatePath('/team', 'layout')
  revalidatePath('/revenue', 'layout')
  return outcome
}

/**
 * The save itself — only the fields the page sent, which are the ones that
 * changed (2026-10-14): a field left out is not touched, so a save never
 * writes back what somebody else changed after the page was opened (another
 * HR, or the same shared login on another computer). Every refusal is a
 * sentence for whoever is at the screen.
 */
async function writeStaff(editor: Awaited<ReturnType<typeof requireActionOn>>, id: string, formData: FormData) {
  const supabase = await createClient()
  const sent = (key: string) => formData.has(key)
  const text = (key: string) => (formData.get(key) as string | null) ?? ''

  // NRIC and the bank accounts are written only by an editor whose title
  // ticks them, and only when the form carried them (2026-10-09, PR4). An
  // editor without the tick was shown •••• and sent nothing; the save must
  // leave them exactly as they were — before, a form without the field wrote
  // NULL over it.
  const writesNric = sees(editor, 'nric') && sent('nric')
  const writesBank1 = sees(editor, 'bank') && (sent('bank_name') || sent('bank_account_no'))
  const writesBank2 = sees(editor, 'bank') && (sent('bank_name_2') || sent('bank_account_no_2'))
  for (const key of ['nric', 'bank_account_no', 'bank_account_no_2']) {
    if (isMasked(text(key).trim())) {
      throw new Error('That number is hidden from you, so it cannot be saved — leave it as it is.')
    }
  }

  const { data: current } = await supabase
    .from('hr_staff_costs')
    .select('department_id, title_id, employment_type, bank_name, user_id, departments(payroll_source)')
    .eq('id', id)
    .maybeSingle()
  if (!current) throw new Error('That person is no longer on the roster')
  // Somebody who signs in signs in with this email: it is theirs to change,
  // by a request from their app, never HR's here (2026-10-16).
  if (sent('email') && current.user_id) throw new Error(LOGIN_EMAIL_LOCKED)

  const patch: TablesUpdate<'hr_staff_costs'> = {}

  if (sent('name')) {
    const name = text('name').trim()
    if (!name) throw new Error('A name is required')
    patch.employee_name = name
  }
  // First and last name (2026-10-17): what the apps call them; blank leaves the full name's parts to answer.
  // A full name changed alone carries them along in the database while they were its parts (hr_staff_costs_split_name).
  if (sent('first_name')) patch.first_name = trimOrNull(formData.get('first_name'))
  if (sent('last_name')) patch.last_name = trimOrNull(formData.get('last_name'))

  // The title dropdown. Department is fixed here, so the row says which
  // department a title has to fit. An unchanged title is left alone: a title
  // deactivated while somebody held it is still theirs (deactivating is what
  // the roles page offers instead of deleting one out from under its
  // holders), and saving their record must not fail on it.
  if (sent('title_id')) {
    const titleId = trimOrNull(formData.get('title_id'))
    if (titleId !== (current.title_id ?? null)) {
      if (titleId) {
        const { data: title } = await supabase
          .from('titles')
          .select('id, name, department_id, is_active')
          .eq('id', titleId)
          .maybeSingle()
        Object.assign(patch, { title_id: titleId, designation: designationForTitle(title, current.department_id) })
      } else {
        Object.assign(patch, { title_id: null, designation: null })
      }
    }
  }

  // Pay and statutory (lib/staff-form.ts): a new pay basis writes what it
  // means — the old Edit form's ticks or its select — and each amount or
  // category sent is checked before it is written. Amounts without a new
  // basis must land on a fixed pay as the record has it NOW.
  const dept = current.departments as { payroll_source?: string | null } | null
  Object.assign(
    patch,
    payPatchForUpdate({
      mode: formData.get('full_commission') === 'on' ? 'full_commission' : formData.get('variable_pay') === 'on' ? 'variable' : str(formData, 'employment_type'),
      fixedPayNow: asksPay(payModeOf({ employment_type: current.employment_type, commission_dept: dept?.payroll_source === 'commission' })),
      basicSalary: sent('basic_salary') ? text('basic_salary') : undefined,
      allowances: sent('allowances') ? text('allowances') : undefined,
      nonStatutoryAllowance: sent('non_statutory_allowance') ? text('non_statutory_allowance') : undefined,
      epfCategory: sent('epf_category') ? text('epf_category') : undefined,
      socsoCategory: sent('socso_category') ? text('socso_category') : undefined,
      isEpfExempt: sent('is_epf_exempt') ? formData.get('is_epf_exempt') === 'on' : undefined,
      pcbCategory: sent('pcb_category') ? text('pcb_category') : undefined,
      childrenCount: sent('children_count') ? text('children_count') : undefined,
    }),
  )

  // A blank HV code keeps the one they have (the code trigger, 2026-09-12).
  if (sent('employee_code')) patch.employee_code = text('employee_code').trim() || null
  // InfoTech's own number (2026-09-12): blank clears it — unlike the HV code,
  // it is not ours to keep, and a wrong one would match the wrong file row.
  if (sent('infotech_code')) patch.infotech_code = text('infotech_code').trim() || null
  if (sent('hire_date')) patch.hire_date = text('hire_date') || null
  if (sent('resignation_date')) patch.resignation_date = text('resignation_date') || null
  if (writesNric) patch.nric = text('nric').replace(/[-\s]/g, '') || null
  for (const key of ['contact_number', 'email', 'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship'] as const) {
    if (sent(key)) patch[key] = trimOrNull(formData.get(key))
  }
  // The address, its six parts together (2026-10-20) — the one-line `address` is the database's to put together.
  const address = addressColumns(formData)
  if (address) Object.assign(patch, address)

  // A bank account is its bank and its number, sent together. Account 2,
  // when sent, is checked against Account 1 as the record will hold it —
  // the one sent beside it, or the one on file.
  const bankName = writesBank1 ? trimOrNull(formData.get('bank_name')) : current.bank_name
  const bankAccountNo = writesBank1
    ? trimOrNull(formData.get('bank_account_no'))
    : writesBank2
      ? ((await readStaffPrivate(supabase, editor, [id])).get(id)?.bank_account_no ?? null)
      : null
  if (writesBank1) Object.assign(patch, { bank_name: bankName, bank_account_no: bankAccountNo })
  if (writesBank2) {
    const second = validateSecondaryStaffBankAccount({
      bankName,
      bankAccountNo,
      bankName2: str(formData, 'bank_name_2'),
      bankAccountNo2: str(formData, 'bank_account_no_2'),
    })
    Object.assign(patch, { bank_name_2: second.bankName2, bank_account_no_2: second.bankAccountNo2 })
  }

  if (Object.keys(patch).length === 0) return

  const { error } = await supabase.from('hr_staff_costs').update(patch).eq('id', id)

  if (error) {
    if (error.code === '23505') {
      throw new Error(
        error.message.includes('infotech')
          ? 'That InfoTech No already belongs to somebody else on the roster'
          : 'Employee code already used by another active staff',
      )
    }
    throw new Error(`Failed to update: ${error.message}`)
  }

  // A title assigns the rank (user, 2026-09-07), and since 2026-09-10 the
  // database does the assigning: `hr_staff_costs_one_line_sync` raises the
  // commission rank to the new title's floor (never lowers it) in the same
  // statement as the title write. Nothing to call, nothing to report.
}

/**
 * Employment status. Both directions, because one was a trap: every list in
 * the app reads `status = 'active'`, so a deactivation used to be a door with
 * no handle on the other side — the row stayed in the database and nothing in
 * the UI could bring it back.
 *
 * Nothing is deleted. `hr_staff_costs` is referenced by payroll, commission
 * statements and the hierarchy, several of them ON DELETE RESTRICT, so the
 * row has to survive; the status is what the readers filter on.
 *
 * `/revenue` matters as much as `/team` here: the Staff Hierarchy chart reads
 * active staff only, so a person deactivated without it stays on the chart
 * until the next hard reload.
 */
async function setEmployment(id: string, status: 'active' | 'inactive') {
  // Its buttons are on the person's full page (PersonChanges › Employment).
  await requireActionOn('/team/people/[id]', 'team', 'edit')
  const supabase = await createClient()

  const { error } = await supabase.from('hr_staff_costs').update({ status }).eq('id', id)

  if (error) {
    throw new Error(
      `Failed to ${status === 'inactive' ? 'deactivate' : 'reactivate'}: ${error.message}`,
    )
  }

  revalidatePath('/hr-costing', 'layout')
  revalidatePath('/team', 'layout')
  revalidatePath('/revenue', 'layout')
}

export async function deactivateStaff(id: string) {
  await setEmployment(id, 'inactive')
}

export async function reactivateStaff(id: string) {
  await setEmployment(id, 'active')
}
