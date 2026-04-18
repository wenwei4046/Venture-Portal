'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

function trimOrNull(v: FormDataEntryValue | null): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

export async function addStaff(formData: FormData) {
  const user = await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  const { data: dept } = await supabase
    .from('departments')
    .select('id')
    .eq('name', formData.get('department') as string)
    .maybeSingle()

  const { error } = await supabase.from('hr_staff_costs').insert({
    employee_name: formData.get('name') as string,
    department_id: dept?.id ?? (formData.get('department_id') as string),
    basic_salary: parseFloat(formData.get('basic_salary') as string) || 0,
    allowances: parseFloat(formData.get('allowances') as string) || 0,
    non_statutory_allowance: parseFloat(formData.get('non_statutory_allowance') as string) || 0,
    contact_number: trimOrNull(formData.get('contact_number')),
    email: trimOrNull(formData.get('email')),
    address: trimOrNull(formData.get('address')),
    emergency_contact_name: trimOrNull(formData.get('emergency_contact_name')),
    emergency_contact_phone: trimOrNull(formData.get('emergency_contact_phone')),
    emergency_contact_relationship: trimOrNull(formData.get('emergency_contact_relationship')),
    created_by: user.id,
  })

  if (error) {
    if (error.code === '23505') throw new Error('Employee already exists')
    throw new Error(`Failed to add staff: ${error.message}`)
  }

  revalidatePath('/hr-costing')
}

export async function updateStaff(id: string, formData: FormData) {
  await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  const hireDate = (formData.get('hire_date') as string) || null
  const resignDate = (formData.get('resignation_date') as string) || null
  const employeeCode = ((formData.get('employee_code') as string) || '').trim() || null
  const bankName = ((formData.get('bank_name') as string) || '').trim() || null
  const bankAccountNo = ((formData.get('bank_account_no') as string) || '').trim() || null
  const nric = ((formData.get('nric') as string) || '').replace(/[-\s]/g, '') || null

  const { error } = await supabase
    .from('hr_staff_costs')
    .update({
      employee_name: formData.get('name') as string,
      basic_salary: parseFloat(formData.get('basic_salary') as string) || 0,
      allowances: parseFloat(formData.get('allowances') as string) || 0,
      non_statutory_allowance: parseFloat(formData.get('non_statutory_allowance') as string) || 0,
      employee_code: employeeCode,
      hire_date: hireDate,
      resignation_date: resignDate,
      epf_category: formData.get('epf_category') as 'A' | 'C' | 'E' | 'F',
      socso_category: formData.get('socso_category') as 'first' | 'second',
      is_epf_exempt: formData.get('is_epf_exempt') === 'on',
      pcb_category: formData.get('pcb_category') as 'KA1' | 'KA2' | 'KA3',
      children_count: parseInt(formData.get('children_count') as string, 10) || 0,
      employment_type: formData.get('employment_type') as 'salaried' | 'commission_eligible',
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

  revalidatePath('/hr-costing')
  revalidatePath(`/hr-costing/staff/${id}/edit`)
}

export async function deactivateStaff(id: string) {
  await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  const { error } = await supabase
    .from('hr_staff_costs')
    .update({ status: 'inactive' })
    .eq('id', id)

  if (error) throw new Error(`Failed to deactivate: ${error.message}`)

  revalidatePath('/hr-costing', 'layout')
}
