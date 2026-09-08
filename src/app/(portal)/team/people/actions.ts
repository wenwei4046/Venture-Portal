'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'
import { validateStaffForm, designationForTitle, payFieldsForUpdate } from '@/lib/staff-form'
import { canAccessRevenue } from '@/lib/roles'
import { syncRankToTitle } from '@/lib/hierarchy-writes'

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
 * no statutory allowance), money that has to be a non-negative number, an
 * account number kept to its digits.
 *
 * A title is a row (2026-09-01), so the chosen one is read back from the
 * table here — it has to exist, be active and fit the department — and
 * `designation`, the free-text column the InfoTech import writes and the
 * payroll export reads, is set to mirror its name.
 */
export async function addStaff(formData: FormData) {
  const user = await requirePermission('team')
  const supabase = await createClient()

  const form = validateStaffForm({
    name: str(formData, 'name'),
    departmentId: str(formData, 'department_id'),
    titleId: str(formData, 'title_id'),
    fullCommission: formData.get('full_commission') === 'on',
    basicSalary: str(formData, 'basic_salary'),
    allowances: str(formData, 'allowances'),
    nonStatutoryAllowance: str(formData, 'non_statutory_allowance'),
    bankName: str(formData, 'bank_name'),
    bankAccountNo: str(formData, 'bank_account_no'),
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
    designation,
    employment_type: form.employmentType,
    basic_salary: form.basicSalary,
    allowances: form.allowances,
    non_statutory_allowance: form.nonStatutoryAllowance,
    bank_name: form.bankName,
    bank_account_no: form.bankAccountNo,
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
    throw new Error(`Failed to add staff: ${error.message}`)
  }

  revalidatePath('/hr-costing')
  revalidatePath('/team', 'layout')
}

export async function updateStaff(id: string, formData: FormData) {
  const user = await requirePermission('team')
  const supabase = await createClient()

  const hireDate = (formData.get('hire_date') as string) || null
  const resignDate = (formData.get('resignation_date') as string) || null
  const employeeCode = ((formData.get('employee_code') as string) || '').trim() || null
  const bankName = ((formData.get('bank_name') as string) || '').trim() || null
  const bankAccountNo = ((formData.get('bank_account_no') as string) || '').trim() || null
  const nric = ((formData.get('nric') as string) || '').replace(/[-\s]/g, '') || null

  // Pay and statutory. lib/staff-form.ts decides what a save writes: the
  // "Fully commission based" tick writes the four columns that say so and
  // leaves the categories alone (they were not on the form); otherwise every
  // field is on the form, and every one is checked before it is written.
  const pay = payFieldsForUpdate({
    fullCommission: formData.get('full_commission') === 'on',
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
      hire_date: hireDate,
      resignation_date: resignDate,
      bank_name: bankName,
      bank_account_no: bankAccountNo,
      nric: nric,
      contact_number: trimOrNull(formData.get('contact_number')),
      email: trimOrNull(formData.get('email')),
      address: trimOrNull(formData.get('address')),
      emergency_contact_name: trimOrNull(formData.get('emergency_contact_name')),
      emergency_contact_phone: trimOrNull(formData.get('emergency_contact_phone')),
      emergency_contact_relationship: trimOrNull(formData.get('emergency_contact_relationship')),
    })
    .eq('id', id)

  if (error) {
    if (error.code === '23505') throw new Error('Employee code already used by another active staff')
    throw new Error(`Failed to update: ${error.message}`)
  }

  // A title assigns the rank (user, 2026-09-07). Only when the title actually
  // moved: re-saving somebody's bank details is not a promotion, and running
  // the sync anyway would fork an effective-dated position row on every edit.
  // Gated on `revenue` because it writes the commission tables — a `team`-only
  // account saves the title and leaves the rank where it was.
  if ('title_id' in titleChange && canAccessRevenue(user)) {
    try {
      await syncRankToTitle(supabase, user.id, id, titleChange.title_id)
    } catch (e) {
      // The title is saved. A rank that could not follow it is a mismatch to
      // fix on Staff Hierarchy, not a reason to tell the user their edit
      // failed — it did not. This form redirects on success and has no channel
      // to carry a note, so the miss goes to the server log; the Hierarchy
      // table is where it becomes visible, as a rank that disagrees with the
      // title beside it. `promoteStaff` DOES report it — see `rankNote` there.
      console.error('[updateStaff] rank did not follow the title', id, e)
    }
  }

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
  await requirePermission('team')
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
