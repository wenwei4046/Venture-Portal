// Changing one's own password (2026-10-12 — the user: "i want every user, have a change password
// function … they write the current version, then the new version, then double check the new
// version"; then, told that principal@, finance@ and hr@ are shared at the office: "just for that
// personal acc").
//
// What a change has to satisfy before the auth server is asked, and how the auth server's refusals
// read on the screen. Pure, so the three forms (the portal's Admin › Change password, the HR app's
// More, the Revenue app's Profile) and the Server Action (lib/account/actions.ts) say the same
// thing, and the rules are tested on their own.

import { MIN_PASSWORD_LENGTH } from '@/lib/invite'

export { MIN_PASSWORD_LENGTH }

/** bcrypt reads no further, and the auth server refuses a longer one. Counted in bytes, as it counts. */
export const MAX_PASSWORD_BYTES = 72

export interface PasswordChange {
  current: string
  next: string
  confirm: string
}

export const NO_PASSWORD_CHANGE: PasswordChange = { current: '', next: '', confirm: '' }

/** Said to a shared login (and to anybody who reaches the change without a People record naming their login). */
export const SHARED_LOGIN = 'This is a shared login, so its password is not changed here. Change password is for a login of your own.'

/** Said when the server cannot be reached, or answers something nobody expected. */
export const NOT_CHANGED = 'The password could not be changed. Please try again.'

const bytes = (s: string) => new TextEncoder().encode(s).length

/**
 * The first thing wrong with a change, worded as the form shows it — or '' once it may be sent.
 * Nothing is trimmed: a space is a legitimate character in a password (lib/invite.ts).
 */
export function passwordChangeProblem({ current, next, confirm }: PasswordChange): string {
  if (!current) return 'Enter your current password.'
  if (!next) return 'Enter a new password.'
  if (next.length < MIN_PASSWORD_LENGTH) return `Your new password needs at least ${MIN_PASSWORD_LENGTH} characters.`
  if (bytes(next) > MAX_PASSWORD_BYTES) return `Your new password is too long — at most ${MAX_PASSWORD_BYTES} characters.`
  if (next === current) return 'Your new password must be different from the current one.'
  if (!confirm) return 'Type the new password again to confirm it.'
  if (confirm !== next) return 'The two new passwords do not match.'
  return ''
}

/** What the auth server hands back when it refuses (supabase-js `AuthError`, `AuthWeakPasswordError`). */
export interface AuthRefusal {
  code?: string
  status?: number
  message?: string
  reasons?: readonly string[]
}

/**
 * The auth server's refusal in the form's words. `step`: proving the current password (a sign-in
 * with it) or setting the new one.
 */
export function passwordRefusal(error: AuthRefusal | null | undefined, step: 'current' | 'new'): string {
  const code = error?.code ?? ''
  if (error?.status === 429 || code.startsWith('over_')) return 'Too many tries. Wait a few minutes, then try again.'
  if (code === 'invalid_credentials' || code === 'current_password_mismatch') return 'Your current password is not right.'
  if (code === 'same_password') return 'Your new password must be different from the current one.'
  if (code === 'weak_password') {
    if (error?.reasons?.includes('pwned')) return 'That password has appeared in a data leak elsewhere. Choose another one.'
    // The auth server's own words name its rule ("Password should be at least 8 characters.").
    return error?.message ? `Your new password is too weak: ${error.message}` : 'Your new password is too weak. Choose a longer one.'
  }
  if (code === 'session_not_found' || code === 'session_expired' || code === 'refresh_token_not_found' || code === 'user_not_found') {
    return 'Your session has ended. Sign in again, then change your password.'
  }
  // A sign-in refused for any other reason still means the current password was not proved.
  if (step === 'current' && error?.status === 400) return 'Your current password is not right.'
  return NOT_CHANGED
}
