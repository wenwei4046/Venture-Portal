import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { viewingAsSomebody } from '@/lib/view-as-person'
import { READ_ONLY_MESSAGE } from '@/lib/supabase/read-only'
import { loginMoveOf, loginMoveRefusal, type LoginMove } from './login-move'

/**
 * A login's email, moved when HR approves its change (2026-10-16, Request to change email — the user: HR approves it
 * on Attendance › Requests, "go with a"). The sign-in lives in the auth server, and only the service role may change
 * another account's email there; the project sends no email, so the person cannot confirm one themselves. This is
 * that one job and nothing else, asked in this order:
 *
 *   1. the database, under HR's own session: is the step about to be decided HR's last on a login's email — and may
 *      this person decide it (`att_login_email_change()`, mig 20261016190000: not their own, Attendance · Approve)?
 *      Anything else needs no move, and is decided as before;
 *   2. never while viewing as somebody (the portal reads only then);
 *   3. the auth server: the login now signs in with the new email (confirmed — nobody is sent anything).
 *
 * Then the request is decided, and the database writes the People record and the login row only because the login
 * already signs in with the new email (`att_profile_apply()`), so the two cannot part. When the decision did not go
 * through, `moveBackUnlessApproved` puts the login back.
 */
export async function moveLoginForApproval(requestId: string): Promise<LoginMove> {
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('att_login_email_change', { p_request: requestId })
  if (error) {
    return { kind: 'refused', reason: error.code === '42501' && error.message ? error.message : 'The request could not be decided.' }
  }
  const move = loginMoveOf(data)
  if (!move) return { kind: 'none' }
  if (await viewingAsSomebody()) return { kind: 'refused', reason: READ_ONLY_MESSAGE }

  const { error: moveError } = await adminClient().auth.admin.updateUserById(move.userId, { email: move.to, email_confirm: true })
  if (moveError) {
    console.error('[login email] move refused', JSON.stringify({ request: requestId, code: moveError.code ?? null, status: moveError.status ?? null }))
    return { kind: 'refused', reason: loginMoveRefusal(moveError.code) }
  }
  return { kind: 'moved', ...move }
}

/**
 * The same job when HR changes a login's email on the person's page (2026-10-22, the user: "i want the email can be
 * editable, for hr"), asked in the same order: never while viewing as somebody; the database, under the editor's own
 * session — may this editor move this person's login to that email (`person_login_email_move()`, mig 20261022150000:
 * People · Edit on their page, a full-access title only by whoever manages permissions, never another login's
 * email)? — then the auth server, unless the login signs in with it already. `none`: they have no login, and the
 * email is the record's own. The record and the login row take it afterwards (`person_login_email_set()`, only once
 * the login signs in with it); when that did not go through, `moveBackUnlessWritten` puts the login back.
 */
export async function moveLoginForPerson(staffId: string, email: string): Promise<LoginMove> {
  if (await viewingAsSomebody()) return { kind: 'refused', reason: READ_ONLY_MESSAGE }
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('person_login_email_move', { p_staff: staffId, p_email: email })
  if (error) {
    // Its refusals are written for the screen: who may (42501) and what may be asked (22023).
    const ours = (error.code === '42501' || error.code === '22023') && error.message
    return { kind: 'refused', reason: ours ? error.message : 'Their email could not be saved. Please try again.' }
  }
  const move = loginMoveOf(data)
  if (!move) return { kind: 'none' }
  if (move.from.toLowerCase() === move.to) return { kind: 'moved', ...move }

  const { error: moveError } = await adminClient().auth.admin.updateUserById(move.userId, { email: move.to, email_confirm: true })
  if (moveError) {
    console.error('[login email] move refused', JSON.stringify({ staff: staffId, code: moveError.code ?? null, status: moveError.status ?? null }))
    return { kind: 'refused', reason: loginMoveRefusal(moveError.code, 'saved') }
  }
  return { kind: 'moved', ...move }
}

/**
 * The write did not go through: unless the new email was written after all (another approver, or an answer lost on
 * the way back — the login row then already reads it), the login signs in with its old email again. Answers what to
 * add to the refusal when it could not be put back — `again` names the button that tries once more.
 */
export async function moveBackUnlessWritten(move: Extract<LoginMove, { kind: 'moved' }>, again: string): Promise<string | null> {
  // Nothing was moved: the login already signed in with it.
  if (move.from.toLowerCase() === move.to) return null
  const admin = adminClient()
  const { data: row } = await admin.from('users').select('email').eq('id', move.userId).maybeSingle()
  if (row?.email?.toLowerCase() === move.to) return null
  const { error } = await admin.auth.admin.updateUserById(move.userId, { email: move.from, email_confirm: true })
  if (!error) return null
  console.error('[login email] move back refused', JSON.stringify({ user: move.userId, code: error.code ?? null, status: error.status ?? null }))
  return `Their login could not be moved back — they sign in with ${move.to} until it is. Try ${again} again.`
}

/** The decision did not go through (2026-10-16): back, unless it was approved after all. */
export function moveBackUnlessApproved(move: Extract<LoginMove, { kind: 'moved' }>): Promise<string | null> {
  return moveBackUnlessWritten(move, 'Approve')
}
