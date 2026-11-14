// Forgot password (2026-11-14, the user: "i want forget password … when press, it can send a
// reset password link to particular gmail"). The sign-in's *Forgot password?* asks Supabase to
// email the login a link (`resetPasswordForEmail`, the template in supabase/templates/recovery.html);
// the link opens our /reset-password, which proves it under the person's own session — the
// invite's /welcome all over again, with `type=recovery`.
//
// Pure, so the words and the checks are tested on their own.

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** The first thing wrong with the address typed for a reset link, or ''. */
export function resetEmailProblem(email: string): string {
  return EMAIL.test(email.trim()) ? '' : 'Type the email you sign in with.'
}

/**
 * Said for every address, known or not: Supabase answers the same for an email that has no
 * login, and so do we — the box cannot be used to find out who works here.
 */
export function resetSentNote(email: string): string {
  return `If ${email.trim()} has an account, a link to reset its password is on its way. Check the inbox and the spam folder.`
}

/** Why no email went, in words — or null for an answer worth only "try again" (logged, never shown). */
export function resetSendRefusal(code: string | null | undefined): string | null {
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit')
    return 'A reset email was sent a moment ago. Wait a minute, then try again.'
  return null
}

export const RESET_EXPIRED = 'This reset link has expired or was already used. Ask for a new one on the sign-in page.'

/** A shared office login (principal@, finance@, hr@) changes no password by email — as Change password refuses it. */
export const RESET_SHARED = 'This is a shared login, so its password is not reset by email. Ask HR.'

/** How long after the link was used its own session may still set the password (a save that failed). */
export const RESET_RETRY_MINUTES = 15

/** The sign-in methods that prove the person holds the mailbox: the reset link itself, or another emailed link. */
const BY_EMAIL = new Set(['recovery', 'otp', 'magiclink'])

/**
 * Whether this session was opened by an emailed link within the last few minutes — what lets a
 * password that failed to save be tried again without the (spent) link. A session opened with the
 * password is not enough: that would be Change password without the current password.
 */
export function openedByEmailLink(amr: unknown, nowMs: number, minutes = RESET_RETRY_MINUTES): boolean {
  if (!Array.isArray(amr)) return false
  return amr.some(entry => {
    if (!entry || typeof entry !== 'object') return false
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown }
    if (typeof method !== 'string' || !BY_EMAIL.has(method) || typeof timestamp !== 'number') return false
    const age = nowMs - timestamp * 1000
    return age >= -60_000 && age < minutes * 60_000
  })
}
