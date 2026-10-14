// Edit profile (2026-10-14, the Finance revamp v2's account menu — the user: a login of one's own only, as
// Change password; the name and the phone change, the email is the sign-in and only shows). What a change
// must satisfy before the database is asked — the same words `update_my_profile()` refuses with
// (mig 20261014210000), so the dialog and the server say one thing.

export interface MyProfile {
  name: string
  email: string
  phone: string
}

export const NAME_MAX = 80
export const PHONE_MAX = 30

/** Said to a shared login, and to anybody who reaches the change without a People record naming their login. */
export const SHARED_PROFILE = 'This is a shared login, so its profile is not changed here. Edit profile is for a login of your own.'

/** The first thing wrong with a change, as the dialog shows it — or '' once it may be sent. */
export function profileProblem({ name, phone }: Pick<MyProfile, 'name' | 'phone'>): string {
  const n = name.trim()
  const p = phone.trim()
  if (!n) return 'Enter your full name.'
  if (n.length > NAME_MAX) return `Your name is too long — at most ${NAME_MAX} characters.`
  if (p && (p.length > PHONE_MAX || !/^[0-9+() -]+$/.test(p))) return 'Enter a phone number like 012-338 4127.'
  return ''
}

/** The database's answer, as the dialog keeps it (a missing phone is an empty box). */
export function profileOf(row: unknown): MyProfile | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  return {
    name: typeof r.name === 'string' ? r.name : '',
    email: typeof r.email === 'string' ? r.email : '',
    phone: typeof r.phone === 'string' ? r.phone : '',
  }
}
