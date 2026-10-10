'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from '@/lib/supabase/admin'
import { viewingAsSomebody } from '@/lib/view-as-person'
import { READ_ONLY_MESSAGE } from '@/lib/supabase/read-only'
import { createClient } from '@/lib/supabase/server'
import { requireAction } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import { validateInvite, type RawInvite } from '@/lib/invite'

export type InviteResult = { ok: true; name: string; email: string } | { ok: false; reason: string }

/**
 * Giving somebody on the roster a login (the invite drawer, 2026-10-08).
 *
 * Three rows have to line up, in this order, because each depends on the last:
 *
 *   auth.users        the credential. Only the service role may create one, so
 *                     this is the one place adminClient is used here.
 *   public.users      the portal identity. Its primary key IS the auth id (FK,
 *                     ON DELETE CASCADE). Its role is not chosen any more: it
 *                     is the person's title's permission template's hidden
 *                     account kind, and the database keeps it so
 *                     (`sync_user_role`) when their title or template moves.
 *   hr_staff_costs    the person, who already exists — the drawer only lists
 *                     active people with no login, and nobody new is made here.
 *
 * Then, optionally, the cells changed for this person alone
 * (`permission_user_cells_set`), which only whoever manages permissions may.
 *
 * If a later step fails the auth user is deleted again rather than left
 * orphaned: that takes the portal user with it (cascade) and unlinks the
 * person (ON DELETE SET NULL), so a retry starts clean.
 *
 * Answers `{ ok: false, reason }` for a refusal somebody should read: a thrown
 * message reaches production's browser only as a digest.
 */
export async function inviteUser(raw: RawInvite): Promise<InviteResult> {
  // Minting a login is the Principal's, not HR's: an account is access.
  const actor = await requireAction('accounts', 'create')
  // A login is minted with the service role, around the read-only session: refused while viewing as somebody (2026-10-11).
  if (await viewingAsSomebody()) return { ok: false, reason: READ_ONLY_MESSAGE }

  let input
  try {
    input = validateInvite(raw)
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Check the form and try again.' }
  }
  if (input.cells.length > 0 && !canDo(actor, 'accounts', 'manage')) {
    return { ok: false, reason: 'Only whoever manages permissions changes a cell for one person. Create the login as the template has it.' }
  }

  const supabase = (await createClient()) as unknown as SupabaseClient

  // Fail before creating a credential we would only have to delete again.
  const { data: emailTaken } = await supabase.from('users').select('id').eq('email', input.email).maybeSingle()
  if (emailTaken) return { ok: false, reason: 'That email already has an account.' }

  const { data: personRow, error: personError } = await supabase
    .from('hr_staff_costs')
    .select('id, employee_name, user_id, status, department_id, titles (name, template_id, permission_templates (name, base_role))')
    .eq('id', input.staffId)
    .maybeSingle()
  if (personError) return { ok: false, reason: 'Could not read their People record. Try again.' }
  const person = personRow as {
    id: string; employee_name: string; user_id: string | null; status: string | null; department_id: string
    titles: {
      name: string; template_id: string | null
      permission_templates: { name: string; base_role: string } | Array<{ name: string; base_role: string }> | null
    } | null
  } | null
  if (!person) return { ok: false, reason: 'That person is no longer on the roster.' }
  if (person.user_id) return { ok: false, reason: `${person.employee_name} already has a login.` }
  if (person.status === 'inactive') return { ok: false, reason: `${person.employee_name} is no longer active — only active people get a login.` }
  if (!person.titles) {
    return { ok: false, reason: `${person.employee_name} has no title yet. Give them one on their People record — the login and its permissions follow the title.` }
  }
  const template = Array.isArray(person.titles.permission_templates)
    ? (person.titles.permission_templates[0] ?? null)
    : person.titles.permission_templates
  if (!template) {
    return {
      ok: false,
      reason: `${person.titles.name} has no permission template yet. Choose one under People Management → Permissions, then invite.`,
    }
  }

  const { data: created, error: authError } = await adminClient().auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: person.employee_name },
  })
  if (authError || !created?.user) return { ok: false, reason: authError?.message ?? 'Could not create the login.' }

  const userId = created.user.id
  const rollBack = async (reason: string): Promise<InviteResult> => {
    await adminClient().auth.admin.deleteUser(userId)
    return { ok: false, reason }
  }

  // The caller's client, not the service role: the same RLS everything else
  // obeys governs these writes, and the history records who made them.
  const { error: userError } = await supabase.from('users').insert({
    id: userId,
    email: input.email,
    name: person.employee_name,
    role: template.base_role,
    department_id: person.department_id,
  })
  if (userError) return rollBack(`Could not create the portal user: ${userError.message}`)

  const { error: linkError } = await supabase
    .from('hr_staff_costs')
    .update({ user_id: userId, email: input.email })
    .eq('id', person.id)
  if (linkError) return rollBack(`Could not attach the login to ${person.employee_name}: ${linkError.message}`)

  if (input.cells.length > 0) {
    const { error: cellsError } = await supabase.rpc('permission_user_cells_set', {
      p_user: userId,
      p_cells: input.cells,
    })
    if (cellsError) return rollBack(`Could not save their own permissions: ${cellsError.message}`)
  }

  revalidatePath('/team', 'layout')
  return { ok: true, name: person.employee_name, email: input.email }
}
