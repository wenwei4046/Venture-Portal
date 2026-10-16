// What moving a login's email at HR's approval answers (2026-10-16, Request to change email): the pure half of
// lib/account/login-email.ts, which may not be imported where a test runs without the service role.

export type LoginMove =
  /** Not HR's last step on a login's email: decided as before. */
  | { kind: 'none' }
  /** The login signs in with `to` now; `from` is where it moves back to if the decision does not go through. */
  | { kind: 'moved'; userId: string; from: string; to: string }
  | { kind: 'refused'; reason: string }

/** `att_login_email_change()`'s answer — null when there is nothing to move. */
export function loginMoveOf(data: unknown): { userId: string; from: string; to: string } | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (typeof d.user_id !== 'string' || typeof d.to !== 'string' || !d.to) return null
  return { userId: d.user_id, from: typeof d.from === 'string' ? d.from : '', to: d.to.toLowerCase() }
}

/** The auth server's refusal, in words for HR; nothing has been decided. */
export function loginMoveRefusal(code: string | null | undefined): string {
  if (code === 'email_exists') return 'That email already belongs to another login. Nothing was decided.'
  if (code === 'email_address_invalid' || code === 'validation_failed') return 'The sign-in service would not take that email. Nothing was decided.'
  if (code === 'user_not_found') return 'Their login is no longer there. Nothing was decided.'
  return 'Their login could not be moved to the new email, so nothing was decided. Please try again.'
}
