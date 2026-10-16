'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from '@/lib/supabase/admin'
import { viewingAsSomebody } from '@/lib/view-as-person'
import { READ_ONLY_MESSAGE } from '@/lib/supabase/read-only'
import { createClient } from '@/lib/supabase/server'
import { requireActionOn } from '@/lib/auth'
import { canDo } from '@/lib/permission-actions'
import {
  MIN_PASSWORD_LENGTH,
  emailRefusal,
  isInviteMode,
  validateInvite,
  welcomeLink,
  type InviteMode,
  type RawInvite,
} from '@/lib/invite'

export type InviteResult =
  | { ok: true; mode: 'password'; name: string; email: string }
  | { ok: true; mode: 'link'; name: string; email: string; emailed: true }
  /** Supabase would not email it: the link to pass on by hand, and why. */
  | { ok: true; mode: 'link'; name: string; email: string; emailed: false; link: string; why: string }
  | { ok: false; reason: string }

type Refusal = { ok: false; reason: string }

interface Invitee {
  id: string
  employee_name: string
  user_id: string | null
  status: string | null
  department_id: string
  template: { name: string; base_role: string }
}

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
 * The credential comes one of two ways (2026-10-16, the user's two choices):
 * a password HR sets (`createUser`, confirmed at once), or an invite link —
 * Supabase emails it (`inviteUserByEmail`) and they choose their password on
 * /welcome. Supabase's own sender writes only to the Supabase organisation's
 * members, two an hour, so when it refuses, the same login is made with
 * `generateLink` instead, which sends nothing, and HR is handed the link to
 * pass on (WhatsApp). Either way the person is attached now and can sign in
 * once they have chosen a password.
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
  const actor = await requireActionOn('/team/people', 'accounts', 'create')
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

  const person = await readInvitee(supabase, input.staffId)
  if ('reason' in person) return person
  if (person.user_id) return { ok: false, reason: `${person.employee_name} already has a login.` }

  let userId: string
  let handover: { emailed: true } | { emailed: false; link: string; why: string } | null = null
  if (input.mode === 'password') {
    const { data: created, error: authError } = await adminClient().auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { name: person.employee_name },
    })
    if (authError || !created?.user) return { ok: false, reason: authError?.message ?? 'Could not create the login.' }
    userId = created.user.id
  } else {
    const link = await sendLink(input.email, person.employee_name)
    if ('reason' in link) return link
    userId = link.userId
    handover = link.handover
  }

  const rollBack = async (reason: string): Promise<Refusal> => {
    await adminClient().auth.admin.deleteUser(userId)
    return { ok: false, reason }
  }

  // The caller's client, not the service role: the same RLS everything else
  // obeys governs these writes, and the history records who made them.
  const { error: userError } = await supabase.from('users').insert({
    id: userId,
    email: input.email,
    name: person.employee_name,
    role: person.template.base_role,
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
  const who = { name: person.employee_name, email: input.email }
  return handover ? { ok: true, mode: 'link', ...who, ...handover } : { ok: true, mode: 'password', ...who }
}

/**
 * Inviting again somebody whose invite link was never used (2026-10-16): the
 * link expires, or never arrived. Their login stays as it is — the same email,
 * the same portal user — and either a new link goes out (the old one stops
 * working) or HR sets the password now, which ends the invite: they sign in
 * with it at once. Somebody who has already chosen a password is not invited
 * again.
 */
export async function reinviteUser(raw: { staffId?: string | null; mode?: string | null; password?: string | null }): Promise<InviteResult> {
  await requireActionOn('/team/people', 'accounts', 'create')
  if (await viewingAsSomebody()) return { ok: false, reason: READ_ONLY_MESSAGE }

  const staffId = (raw.staffId ?? '').trim()
  const mode: InviteMode | null = isInviteMode(raw.mode) ? raw.mode : null
  if (!staffId || !mode) return { ok: false, reason: 'Reload the page and try again.' }
  const password = raw.password ?? ''
  if (mode === 'password' && password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }
  }

  const supabase = (await createClient()) as unknown as SupabaseClient
  const person = await readInvitee(supabase, staffId)
  if ('reason' in person) return person
  if (!person.user_id) return { ok: false, reason: `${person.employee_name} has no login yet — invite them instead.` }

  const { data: found, error: findError } = await adminClient().auth.admin.getUserById(person.user_id)
  if (findError || !found?.user?.email) return { ok: false, reason: 'Could not read their login. Try again.' }
  const login = found.user
  if (!login.invited_at || login.email_confirmed_at) {
    return { ok: false, reason: `${person.employee_name} has already set a password — they sign in with it.` }
  }
  const email = login.email as string
  const who = { name: person.employee_name, email }

  if (mode === 'password') {
    const { error } = await adminClient().auth.admin.updateUserById(login.id, { password, email_confirm: true })
    if (error) return { ok: false, reason: error.message }
    revalidatePath('/team', 'layout')
    return { ok: true, mode: 'password', ...who }
  }

  const link = await sendLink(email, person.employee_name)
  if ('reason' in link) return link
  revalidatePath('/team', 'layout')
  return { ok: true, mode: 'link', ...who, ...link.handover }
}

/**
 * The person, their title's template and whether they may have a login at all.
 * Read under the caller's session, as the roster is.
 */
async function readInvitee(supabase: SupabaseClient, staffId: string): Promise<Invitee | Refusal> {
  const { data: personRow, error: personError } = await supabase
    .from('hr_staff_costs')
    .select('id, employee_name, user_id, status, department_id, titles (name, template_id, permission_templates (name, base_role))')
    .eq('id', staffId)
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
  return {
    id: person.id,
    employee_name: person.employee_name,
    user_id: person.user_id,
    status: person.status,
    department_id: person.department_id,
    template,
  }
}

/**
 * The invite link: emailed by Supabase when it will, else made without an
 * email and handed back to pass on. Either makes the auth user if there is
 * none yet (unconfirmed, no password), or gives an unconfirmed one a new token.
 */
async function sendLink(
  email: string,
  name: string,
): Promise<{ userId: string; handover: { emailed: true } | { emailed: false; link: string; why: string } } | Refusal> {
  const admin = adminClient().auth.admin
  const sent = await admin.inviteUserByEmail(email, { data: { name } })
  if (!sent.error && sent.data?.user) return { userId: sent.data.user.id, handover: { emailed: true } }
  if (sent.error?.code === 'email_exists') return { ok: false, reason: 'That email already has an account.' }

  const made = await admin.generateLink({ type: 'invite', email, options: { data: { name } } })
  if (made.error || !made.data?.user || !made.data.properties?.hashed_token) {
    return { ok: false, reason: made.error?.message ?? 'Could not create the invite link.' }
  }
  const host = (await headers()).get('host')
  return {
    userId: made.data.user.id,
    handover: { emailed: false, link: welcomeLink(host, made.data.properties.hashed_token), why: emailRefusal(sent.error?.code) },
  }
}
