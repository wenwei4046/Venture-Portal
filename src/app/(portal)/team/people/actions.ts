'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'
import { validateStaffForm, designationForTitle, payFieldsForUpdate } from '@/lib/staff-form'
import { validateSecondaryStaffBankAccount } from '@/lib/staff-bank-accounts'
import { isMasked, sees } from '@/lib/sensitive'

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
    address: str(formData, 'address'),
    emergencyContactName: str(formData, 'emergency_contact_name'),
    emergencyContactPhone: str(formData, 'emergency_contact_phone'),
    emergencyContactRelationship: str(formData, 'emergency_contact_relationship'),
  })

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
    address: form.address,
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

export async function updateStaff(id: string, formData: FormData) {
  const editor = await requireActionOn('/team/people/[id]/edit', 'team', 'edit')
  const supabase = await createClient()

  // The form writes pay, so it is an editor whose title ticks Salary amounts
  // (2026-10-09, PR4) — anybody else was never shown the figures it saves.
  if (!sees(editor, 'salary')) {
    throw new Error('Editing a person needs Salary amounts ticked for your title — the form saves their pay.')
  }

  // NRIC and the bank accounts are written only by an editor whose title
  // ticks them, and only when the form carried them (2026-10-09, PR4). An
  // editor without the tick was shown •••• and sent nothing; the save must
  // leave them exactly as they were — before, a form without the field wrote
  // NULL over it.
  const writesNric = sees(editor, 'nric') && formData.has('nric')
  const writesBank = sees(editor, 'bank') && (formData.has('bank_name') || formData.has('bank_account_no'))
  for (const key of ['nric', 'bank_account_no', 'bank_account_no_2']) {
    if (isMasked(((formData.get(key) as string | null) ?? '').trim())) {
      throw new Error('That number is hidden from you, so it cannot be saved — leave it as it is.')
    }
  }

  const hireDate = (formData.get('hire_date') as string) || null
  const resignDate = (formData.get('resignation_date') as string) || null
  const employeeCode = ((formData.get('employee_code') as string) || '').trim() || null
  // InfoTech's own number (2026-09-12). Only a form that carries the field
  // may change it; blank clears it — unlike the HV code, it is not ours to
  // keep, and a wrong one would match the wrong file row.
  const infotech = formData.has('infotech_code')
    ? { infotech_code: ((formData.get('infotech_code') as string) || '').trim() || null }
    : {}
  const bankName = ((formData.get('bank_name') as string) || '').trim() || null
  const bankAccountNo = ((formData.get('bank_account_no') as string) || '').trim() || null
  // Older clients and imports that only carry Account 1 must not clear Account 2.
  const secondBank = writesBank && (formData.has('bank_name_2') || formData.has('bank_account_no_2'))
    ? validateSecondaryStaffBankAccount({
        bankName, bankAccountNo,
        bankName2: str(formData, 'bank_name_2'),
        bankAccountNo2: str(formData, 'bank_account_no_2'),
      })
    : null
  const nric = ((formData.get('nric') as string) || '').replace(/[-\s]/g, '') || null

  // Pay and statutory. lib/staff-form.ts decides what a save writes: the
  // "Fully commission based" tick writes the four columns that say so and
  // leaves the categories alone (they were not on the form); the "Variable
  // pay" tick writes the three amounts as 0 and the categories with them;
  // otherwise every field is on the form, and every one is checked before it
  // is written.
  const pay = payFieldsForUpdate({
    fullCommission: formData.get('full_commission') === 'on',
    variablePay: formData.get('variable_pay') === 'on',
    employmentType: str(formData, 'employment_type'),
    basicSalary: str(formData, 'basic_salary'),
    allowances: str(formData, 'allowances'),
    nonStatutoryAllowance: str(formData, 'non_statutory_allowance'),
    epfCategory: str(formData, 'epf_category'),
    socsoCategory: str(formData, 'socso_category'),
    isEpfExempt: formData.get('is_epf_exempt') === 'on',
    pcbCategory: str(formData, 'pcb_category'),
    childrenCount: str(formData, 'children_count'),
  })

  // The title dropdown. Department is fixed on this form, so the row says
  // which department a title has to fit. An unchanged title is left alone: a
  // title deactivated while somebody held it is still theirs (deactivating
  // is what the roles page offers instead of deleting one out from under its
  // holders), and re-saving their record must not fail on it.
  const { data: current } = await supabase
    .from('hr_staff_costs')
    .select('department_id, title_id')
    .eq('id', id)
    .maybeSingle()
  if (!current) throw new Error('That person is no longer on the roster')

  const titleId = trimOrNull(formData.get('title_id'))
  let titleChange: { title_id: string | null; designation: string | null } | Record<string, never> = {}
  if (titleId !== (current.title_id ?? null)) {
    if (titleId) {
      const { data: title } = await supabase
        .from('titles')
        .select('id, name, department_id, is_active')
        .eq('id', titleId)
        .maybeSingle()
      titleChange = { title_id: titleId, designation: designationForTitle(title, current.department_id) }
    } else {
      titleChange = { title_id: null, designation: null }
    }
  }

  const { error } = await supabase
    .from('hr_staff_costs')
    .update({
      employee_name: formData.get('name') as string,
      ...titleChange,
      ...pay,
      employee_code: employeeCode,
      ...infotech,
      hire_date: hireDate,
      resignation_date: resignDate,
      ...(writesBank ? { bank_name: bankName, bank_account_no: bankAccountNo } : {}),
      ...(secondBank ? { bank_name_2: secondBank.bankName2, bank_account_no_2: secondBank.bankAccountNo2 } : {}),
      ...(writesNric ? { nric } : {}),
      contact_number: trimOrNull(formData.get('contact_number')),
      email: trimOrNull(formData.get('email')),
      address: trimOrNull(formData.get('address')),
      emergency_contact_name: trimOrNull(formData.get('emergency_contact_name')),
      emergency_contact_phone: trimOrNull(formData.get('emergency_contact_phone')),
      emergency_contact_relationship: trimOrNull(formData.get('emergency_contact_relationship')),
    })
    .eq('id', id)

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

  revalidatePath('/hr-costing')
  revalidatePath(`/team/people/${id}/edit`)
  // The org chart draws the title, the ladder rung it stands on and the rank —
  // all three can change here, so the graph is stale until this runs. Its
  // absence was why a title edited on People did not show on Hierarchy until
  // the next hard reload.
  revalidatePath('/team', 'layout')
  revalidatePath('/revenue', 'layout')
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
  await requireActionOn('/team/people/[id]/edit', 'team', 'edit')
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
