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
 *
 * Refusals come back as `{ ok: false, reason }` (Hierarchy › People & roles'
 * title window shows them): a thrown message reaches production's browser
 * only as a digest.
 */

export type TitleOutcome = { ok: true } | { ok: false; reason: string }

export interface TitleInput {
  /** Absent for a new title. */
  id?: string
  name: string
  departmentId: string | null
  /** The rung it stands on; null = not on the ladder. */
  levelId: string | null
  isActive: boolean
  /**
   * "Heads the department" (2026-09-11): the title stands above the commission
   * ladder — no rung, no rank, no override — and is the one everybody in a
   * commission department may report to. Revenue Director. The database
   * refuses a rung or a membership on such a title (23DIR) and closes any
   * membership its new holder had, so ticking it is the whole change.
   */
  isDepartmentHead: boolean
}

function refresh() {
  revalidatePath('/team', 'layout')
}

/** Why a title cannot be saved as it is, or null. */
function refusalOf(input: TitleInput): string | null {
  const name = input.name.trim()
  if (!name) return 'A title needs a name'
  if (name.length > 120) return 'That name is too long'
  return null
}

function saveError(error: { code?: string; message: string }, verb: string): string {
  // 23505 is the (name, department) unique index — the one mistake somebody
  // will actually make, so it gets a sentence instead of a Postgres string.
  if (error.code === '23505') return 'That department already has a title by that name'
  // 23DIR: the title now heads the department while a rung still points at it
  // — the trigger's sentence says which, and it is the whole answer.
  if (error.code === '23DIR') return error.message
  return `Could not ${verb} the title. Please try again.`
}

export async function createTitle(input: TitleInput): Promise<TitleOutcome> {
  const user = await requireAction('team', 'manage')
  const refused = refusalOf(input)
  if (refused) return { ok: false, reason: refused }
  const supabase = await createClient()

  const { error } = await supabase.from('titles').insert({
    name: input.name.trim(),
    department_id: input.departmentId,
    level_id: input.levelId,
    is_department_head: input.isDepartmentHead,
    created_by: user.id,
  })
  if (error) return { ok: false, reason: saveError(error, 'create') }

  refresh()
  return { ok: true }
}

export async function updateTitle(input: TitleInput): Promise<TitleOutcome> {
  await requireAction('team', 'manage')
  if (!input.id) return { ok: false, reason: 'Which title?' }
  const refused = refusalOf(input)
  if (refused) return { ok: false, reason: refused }
  const supabase = await createClient()

  const { error } = await supabase
    .from('titles')
    .update({
      name: input.name.trim(),
      department_id: input.departmentId,
      level_id: input.levelId,
      is_active: input.isActive,
      is_department_head: input.isDepartmentHead,
    })
    .eq('id', input.id)
  if (error) return { ok: false, reason: saveError(error, 'save') }

  refresh()
  return { ok: true }
}

/**
 * Removing a title is the Principal's, and only while nobody holds it.
 *
 * `title_id` is ON DELETE SET NULL, so deleting one out from under its holders
 * would quietly strip their titles instead of failing. Counting first turns
 * that into a refusal that says who is in the way.
 */
export async function deleteTitle(id: string): Promise<TitleOutcome> {
  await requireAction('accounts', 'manage')
  const supabase = await createClient()

  const { count } = await supabase
    .from('hr_staff_costs')
    .select('id', { count: 'exact', head: true })
    .eq('title_id', id)

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      reason: `${count} ${count === 1 ? 'person holds' : 'people hold'} this title — move them first, or deactivate it instead`,
    }
  }

  const { error } = await supabase.from('titles').delete().eq('id', id)
  if (error) return { ok: false, reason: 'Could not delete the title. Please try again.' }

  refresh()
  return { ok: true }
}
