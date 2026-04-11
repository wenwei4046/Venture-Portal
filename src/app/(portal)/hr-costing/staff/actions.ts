'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'

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
    is_mgmt_fee: formData.get('is_mgmt_fee') === 'true',
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

  const { error } = await supabase
    .from('hr_staff_costs')
    .update({
      employee_name: formData.get('name') as string,
      basic_salary: parseFloat(formData.get('basic_salary') as string) || 0,
      allowances: parseFloat(formData.get('allowances') as string) || 0,
      non_statutory_allowance: parseFloat(formData.get('non_statutory_allowance') as string) || 0,
      is_mgmt_fee: formData.get('is_mgmt_fee') === 'true',
    })
    .eq('id', id)

  if (error) throw new Error(`Failed to update: ${error.message}`)

  revalidatePath('/hr-costing')
}

export async function deleteStaff(id: string) {
  await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  const { error } = await supabase
    .from('hr_staff_costs')
    .delete()
    .eq('id', id)

  if (error) throw new Error(`Failed to delete: ${error.message}`)

  revalidatePath('/hr-costing')
}

export async function deactivateStaff(id: string) {
  await requireRole(['hr', 'principal'])
  const supabase = await createClient()

  const { error } = await supabase
    .from('hr_staff_costs')
    .update({ status: 'inactive' })
    .eq('id', id)

  if (error) throw new Error(`Failed to deactivate: ${error.message}`)

  revalidatePath('/hr-costing')
}
