'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth'

/**
 * Granting permissions.
 *
 * A title with no rows in `title_permissions` inherits its holder's role
 * defaults; the first tick makes the title authoritative and the role stops
 * being consulted for anybody holding it. That is why "inherit" and "grant
 * nothing" have to be different states, and why clearing a title is its own
 * action rather than saving an empty list.
 */

function refresh() {
  revalidatePath('/team', 'layout')
}

export async function setTitlePermissions(titleId: string, keys: string[]): Promise<void> {
  await requirePermission('permissions_manage')
  if (!titleId) throw new Error('Which title?')

  const supabase = await createClient()

  // Replace the set outright: a diff would leave the two halves able to
  // disagree if one statement failed.
  const { error: clearError } = await supabase
    .from('title_permissions')
    .delete()
    .eq('title_id', titleId)
  if (clearError) throw new Error(`Could not save: ${clearError.message}`)

  if (keys.length > 0) {
    const { error } = await supabase
      .from('title_permissions')
      .insert(keys.map(k => ({ title_id: titleId, permission_key: k })))
    if (error) throw new Error(`Could not save: ${error.message}`)
  }

  refresh()
}

/** Hand the title back to the role defaults. Not the same as granting nothing. */
export async function resetTitleToRoleDefaults(titleId: string): Promise<void> {
  await requirePermission('permissions_manage')
  if (!titleId) throw new Error('Which title?')

  const supabase = await createClient()
  const { error } = await supabase.from('title_permissions').delete().eq('title_id', titleId)
  if (error) throw new Error(`Could not reset: ${error.message}`)

  refresh()
}

/**
 * A per-person exception.
 *
 * `granted` false is an explicit denial, not an absence — one person can be
 * held back from something their title allows. Passing null removes the
 * exception and hands them back to their title.
 */
export async function setUserPermission(
  userId: string,
  key: string,
  granted: boolean | null,
): Promise<void> {
  await requirePermission('permissions_manage')
  if (!userId || !key) throw new Error('Which person, and which permission?')

  const supabase = await createClient()

  if (granted === null) {
    const { error } = await supabase
      .from('user_permissions')
      .delete()
      .eq('user_id', userId)
      .eq('permission_key', key)
    if (error) throw new Error(`Could not clear the exception: ${error.message}`)
  } else {
    const { error } = await supabase
      .from('user_permissions')
      .upsert({ user_id: userId, permission_key: key, granted }, { onConflict: 'user_id,permission_key' })
    if (error) throw new Error(`Could not save the exception: ${error.message}`)
  }

  refresh()
}
