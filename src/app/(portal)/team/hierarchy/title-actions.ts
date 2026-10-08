'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAction } from '@/lib/auth'

/**
 * Titles.
 *
 * A title says what somebody is called and which department that role sits
 * under; from the permission phase on it is also what carries permissions,
 * which is why it is a row and not the free text it used to be
 * (`hr_staff_costs.designation`, 20 hand-typed spellings).
 *
 * HR writes titles as well as the Principal: HR runs the roster and would
 * otherwise be unable to file a new hire under a title nobody had created yet.
 * Deleting one stays with the Principal — see `deleteTitle`.
 */

function refresh() {
  revalidatePath('/team', 'layout')
}

function readName(formData: FormData): string {
  const name = ((formData.get('name') as string) ?? '').trim()
  if (!name) throw new Error('A title needs a name')
  if (name.length > 120) throw new Error('That name is too long')
  return name
}

function readDepartmentId(formData: FormData): string | null {
  const id = ((formData.get('department_id') as string) ?? '').trim()
  return id === '' ? null : id
}

/**
 * "Heads the department" (2026-09-11): the title stands above the commission
 * ladder — no rung, no rank, no override — and is the one everybody in a
 * commission department may report to. Revenue Director. The database
 * refuses a rung or a membership on such a title (23DIR) and closes any
 * membership its new holder had, so ticking it is the whole change.
 */
function readDepartmentHead(formData: FormData): boolean {
  return formData.get('is_department_head') === 'on'
}

export async function createTitle(formData: FormData): Promise<void> {
  const user = await requireAction('team', 'manage')
  const supabase = await createClient()

  const { error } = await supabase.from('titles').insert({
    name: readName(formData),
    department_id: readDepartmentId(formData),
    is_department_head: readDepartmentHead(formData),
    created_by: user.id,
  })

  if (error) {
    // 23505 is the (name, department) unique index — the one mistake somebody
    // will actually make, so it gets a sentence instead of a Postgres string.
    if (error.code === '23505') {
      throw new Error('That department already has a title by that name')
    }
    throw new Error(`Could not create the title: ${error.message}`)
  }

  refresh()
}

export async function updateTitle(formData: FormData): Promise<void> {
  await requireAction('team', 'manage')
  const supabase = await createClient()

  const id = ((formData.get('id') as string) ?? '').trim()
  if (!id) throw new Error('Which title?')

  const { error } = await supabase
    .from('titles')
    .update({
      name: readName(formData),
      department_id: readDepartmentId(formData),
      is_active: formData.get('is_active') === 'on',
      is_department_head: readDepartmentHead(formData),
    })
    .eq('id', id)

  if (error) {
    if (error.code === '23505') {
      throw new Error('That department already has a title by that name')
    }
    // 23DIR: the title now heads the department while a rung still points at
    // it — the trigger's sentence says which, and it is the whole answer.
    if (error.code === '23DIR') throw new Error(error.message)
    throw new Error(`Could not save the title: ${error.message}`)
  }

  refresh()
}

/**
 * Removing a title is the Principal's, and only while nobody holds it.
 *
 * `title_id` is ON DELETE SET NULL, so deleting one out from under its holders
 * would quietly strip their titles instead of failing. Counting first turns
 * that into a refusal that says who is in the way.
 */
export async function deleteTitle(id: string): Promise<void> {
  await requireAction('accounts', 'manage')
  const supabase = await createClient()

  const { count } = await supabase
    .from('hr_staff_costs')
    .select('id', { count: 'exact', head: true })
    .eq('title_id', id)

  if ((count ?? 0) > 0) {
    throw new Error(
      `${count} ${count === 1 ? 'person holds' : 'people hold'} this title — move them first, or deactivate it instead`,
    )
  }

  const { error } = await supabase.from('titles').delete().eq('id', id)
  if (error) throw new Error(`Could not delete the title: ${error.message}`)

  refresh()
}
