'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAccountUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { READ_ONLY_MESSAGE } from '@/lib/supabase/read-only'
import { viewingAsSomebody } from '@/lib/view-as-person'
import { revalidatePath } from 'next/cache'
import { askPersonalLogin } from './personal-login'
import { NOT_CHANGED, SHARED_LOGIN, passwordChangeProblem, passwordRefusal, type AuthRefusal, type PasswordChange } from './password'
import { SHARED_PROFILE, profileOf, profileProblem, type MyProfile } from './profile'
import { NOT_SENT, SHARED_EMAIL, emailChangeOf, emailProblem, type EmailAct, type EmailChange, type MyEmail } from './email-change'

type Act = { ok: true } | { ok: false; reason: string }

/**
 * One's own profile, for Edit profile (2026-10-14, the Finance revamp v2's account menu): the
 * name, the sign-in email, the phone on their People record. The database answers for the caller
 * only (`my_profile()`, mig 20261014210000) — the roster is closed to most logins. Null when it
 * could not be read, while viewing as somebody, and for a shared login (nothing to edit there).
 */
export async function loadMyProfile(): Promise<MyProfile | null> {
  const user = await getAccountUser()
  if (!user?.is_active || (await viewingAsSomebody())) return null
  if ((await askPersonalLogin()) !== true) return null
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('my_profile')
  if (error) return null
  return profileOf(data)
}

/**
 * Change one's own name and phone (2026-10-14 — the user: build Edit profile, a login of one's own
 * only, as Change password; the email only shows). The name is the login's (`users.name`, what a
 * voucher prints for whoever made it); the phone is their People record's. Asked in the same order
 * as the password: the change itself, an active sign-in, not while viewing as somebody, a login of
 * their own — and the database asks the last again (`update_my_profile()`).
 */
export async function updateMyProfile(input: { name: string; phone: string }): Promise<{ ok: true; profile: MyProfile } | { ok: false; reason: string }> {
  const change = {
    name: typeof input?.name === 'string' ? input.name : '',
    phone: typeof input?.phone === 'string' ? input.phone : '',
  }
  const problem = profileProblem(change)
  if (problem) return { ok: false, reason: problem }

  const user = await getAccountUser()
  if (!user?.is_active) return { ok: false, reason: 'Sign in with an active work account.' }
  if (await viewingAsSomebody()) return { ok: false, reason: READ_ONLY_MESSAGE }
  const personal = await askPersonalLogin()
  if (personal === null) return { ok: false, reason: 'Your profile could not be saved. Please try again.' }
  if (!personal) return { ok: false, reason: SHARED_PROFILE }

  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('update_my_profile', { p_name: change.name.trim(), p_phone: change.phone.trim() })
  if (error) {
    // The database's refusals are written for the screen (22023 / 42501); anything else is not.
    if (error.code === '22023' || error.code === '42501') return { ok: false, reason: error.message }
    console.error('[profile] save refused', JSON.stringify({ user: user.id, code: error.code ?? null }))
    return { ok: false, reason: 'Your profile could not be saved. Please try again.' }
  }
  const profile = profileOf(data)
  if (!profile) return { ok: false, reason: 'Your profile could not be saved. Please try again.' }
  // The greeting and the sidebar's footer print the name: every page drawn before now is stale.
  revalidatePath('/', 'layout')
  return { ok: true, profile }
}

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
 *      phones and computers sign in again with it (once the access token each holds runs out, within
 *      an hour); this device stays signed in.
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
  // An unanswered question is not a shared login: say only that it did not work.
  const personal = await askPersonalLogin()
  if (personal === null) return { ok: false, reason: NOT_CHANGED }
  if (!personal) return { ok: false, reason: SHARED_LOGIN }

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

/**
 * Request to change email (2026-10-16 — the user: their email is the one they sign in with, "不能乱改的，除非他们
 * request to change email", an option in their app; HR approves it on Attendance › Requests, which moves the login
 * too — lib/attendance/actions.ts › decideRequest). The sheet opens on the email they sign in with and their latest
 * request (`my_email_change()`, mig 20261016190000 — the caller's own only). Null while viewing as somebody, for a
 * shared login, and when it could not be read.
 */
export async function loadMyEmailChange(): Promise<MyEmail | null> {
  const user = await getAccountUser()
  if (!user?.is_active || (await viewingAsSomebody())) return null
  if ((await askPersonalLogin()) !== true) return null
  return readMyEmail(user.email)
}

/**
 * Send the request: a profile change of the one field, to HR (`request_my_email_change()` — one at a time, through
 * the module's own request, its route and its trail). Asked in Change password's order: the email itself, an active
 * sign-in, not while viewing as somebody, a login of their own — and the database asks the last again.
 */
export async function requestEmailChange(email: string): Promise<EmailAct> {
  const next = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const user = await getAccountUser()
  if (!user?.is_active) return { ok: false, reason: 'Sign in with an active work account.' }
  const problem = emailProblem(next, user.email ?? '')
  if (problem) return { ok: false, reason: problem }
  if (await viewingAsSomebody()) return { ok: false, reason: READ_ONLY_MESSAGE }
  const personal = await askPersonalLogin()
  if (personal === null) return { ok: false, reason: NOT_SENT }
  if (!personal) return { ok: false, reason: SHARED_EMAIL }

  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('request_my_email_change', { p_email: next })
  if (error) return emailRefused(user.id, 'send', error)
  // HR's queue lists it.
  revalidatePath('/attendance', 'layout')
  const sent = data as { id?: unknown; ref?: unknown } | null
  const mine = await readMyEmail(user.email)
  return {
    ok: true,
    mine: mine ?? {
      email: user.email,
      latest: typeof sent?.id === 'string'
        ? { id: sent.id, ref: typeof sent.ref === 'string' ? sent.ref : '', status: 'pending', to: next, from: user.email, at: null, decidedAt: null, note: null }
        : null,
    },
  }
}

/** Withdraw it while it waits — only the one their sheet shows, never any other request by its id. */
export async function withdrawEmailChange(id: string): Promise<EmailAct> {
  const NOT_WITHDRAWN = 'Your request could not be withdrawn. Please try again.'
  const user = await getAccountUser()
  if (!user?.is_active) return { ok: false, reason: 'Sign in with an active work account.' }
  if (await viewingAsSomebody()) return { ok: false, reason: READ_ONLY_MESSAGE }
  const personal = await askPersonalLogin()
  if (personal === null) return { ok: false, reason: NOT_WITHDRAWN }
  if (!personal) return { ok: false, reason: SHARED_EMAIL }

  const mine = await readMyEmail(user.email)
  if (!mine) return { ok: false, reason: NOT_WITHDRAWN }
  const latest: EmailChange | null = mine.latest
  if (!latest || latest.id !== id || latest.status !== 'pending') return { ok: false, reason: 'That request is no longer waiting.' }

  const supabase = (await createClient()) as unknown as SupabaseClient
  const { error } = await supabase.rpc('att_cancel_request', { p_request: id, p_note: '' })
  if (error) return emailRefused(user.id, 'withdraw', error)
  revalidatePath('/attendance', 'layout')
  return { ok: true, mine: (await readMyEmail(user.email)) ?? { email: user.email, latest: { ...latest, status: 'cancelled' } } }
}

async function readMyEmail(email: string): Promise<MyEmail | null> {
  // The function postdates database.types.ts.
  const supabase = (await createClient()) as unknown as SupabaseClient
  const { data, error } = await supabase.rpc('my_email_change')
  if (error) return null
  return { email, latest: emailChangeOf(data) }
}

/** The database's refusals are written for the screen (22023 / 42501 / P0001); anything else goes to the log. */
function emailRefused(userId: string, step: 'send' | 'withdraw', error: { code?: string; message: string }): EmailAct {
  if (error.code === '22023' || error.code === '42501' || error.code === 'P0001') return { ok: false, reason: error.message }
  console.error('[email change] refused', JSON.stringify({ user: userId, step, code: error.code ?? null }))
  return { ok: false, reason: step === 'send' ? NOT_SENT : 'Your request could not be withdrawn. Please try again.' }
}

/** The refusal in words; anything but a mistyped current password goes to the server's log — never a password. */
function refused(userId: string, step: 'current' | 'new', error: AuthRefusal): Act {
  if (error.code !== 'invalid_credentials') {
    console.error('[password] change refused', JSON.stringify({ user: userId, step, code: error.code ?? null, status: error.status ?? null }))
  }
  return { ok: false, reason: passwordRefusal(error, step) }
}
