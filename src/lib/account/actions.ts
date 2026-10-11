'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAccountUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { READ_ONLY_MESSAGE } from '@/lib/supabase/read-only'
import { viewingAsSomebody } from '@/lib/view-as-person'
import { loginIsPersonal } from './personal-login'
import { SHARED_LOGIN, passwordChangeProblem, passwordRefusal, type AuthRefusal, type PasswordChange } from './password'

type Act = { ok: true } | { ok: false; reason: string }

/**
 * Change one's own password (2026-10-12 — the user: every user, from their profile or the admin
 * category: the current password, then the new one, then the new one again; and "just for that
 * personal acc"). One action for the three forms: the portal's Admin › Change password, the HR
 * app's More and the Revenue app's Profile.
 *
 * Asked in this order: the change itself (lib/account/password.ts), an active sign-in, not while
 * viewing the portal as somebody (whose screen it would seem to be), and a login of their own — a
 * shared one (principal@, finance@, hr@, marketing@) would lock everybody else out of it.
 *
 * Then the auth server, with the session's own client (no service role):
 *   1. the current password, proved by signing in with it — refused, nothing has changed;
 *      accepted, this device holds a fresh session (which also satisfies an auth server that wants
 *      a recent sign-in before a password changes);
 *   2. the new password — and the auth server signs every OTHER session of the account out, so other
 *      phones and computers sign in again with it; this device stays signed in.
 *
 * Answers `{ ok: false, reason }` for a refusal somebody should read: a thrown message reaches
 * production's browser only as a digest.
 */
export async function changeMyPassword(input: PasswordChange): Promise<Act> {
  const change: PasswordChange = {
    current: typeof input?.current === 'string' ? input.current : '',
    next: typeof input?.next === 'string' ? input.next : '',
    confirm: typeof input?.confirm === 'string' ? input.confirm : '',
  }
  const problem = passwordChangeProblem(change)
  if (problem) return { ok: false, reason: problem }

  const user = await getAccountUser()
  if (!user?.is_active) return { ok: false, reason: 'Sign in with an active work account.' }
  if (await viewingAsSomebody()) return { ok: false, reason: READ_ONLY_MESSAGE }
  if (!(await loginIsPersonal())) return { ok: false, reason: SHARED_LOGIN }

  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data: who } = await supabase.auth.getUser()
  const email = who?.user?.email
  if (!email) return { ok: false, reason: 'Your session has ended. Sign in again, then change your password.' }

  const proved = await supabase.auth.signInWithPassword({ email, password: change.current })
  if (proved.error) return refused(user.id, 'current', proved.error)

  // `current_password` too: an auth server set to require it checks it again; one that is not ignores it.
  const { error } = await supabase.auth.updateUser({ password: change.next, current_password: change.current })
  if (error) return refused(user.id, 'new', error)
  return { ok: true }
}

/** The refusal in words; anything but a mistyped current password goes to the server's log — never a password. */
function refused(userId: string, step: 'current' | 'new', error: AuthRefusal): Act {
  if (error.code !== 'invalid_credentials') {
    console.error('[password] change refused', JSON.stringify({ user: userId, step, code: error.code ?? null, status: error.status ?? null }))
  }
  return { ok: false, reason: passwordRefusal(error, step) }
}
