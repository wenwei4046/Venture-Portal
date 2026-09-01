// What an invite has to satisfy before anybody touches the database.
//
// Split out of the Server Action so it can be tested on its own: this is the
// part that will be edited most (a new role, a longer password rule) and the
// part whose failure is worst — an invite that gets through half-formed leaves
// a credential that can sign in with no portal identity behind it.
//
// Pure. It normalises as well as checks, so the action writes exactly what
// came back and nothing it re-derives itself.

export const INVITE_ROLES = ['principal', 'finance', 'hr', 'dept_manager'] as const
export type InviteRole = (typeof INVITE_ROLES)[number]

/** Supabase hard-floors this and answers a shorter one with a 422. */
export const MIN_PASSWORD_LENGTH = 6

export interface RawInvite {
  name?: string | null
  email?: string | null
  password?: string | null
  role?: string | null
  departmentId?: string | null
  titleId?: string | null
  reportsTo?: string | null
  phone?: string | null
  staffId?: string | null
}

export interface ValidInvite {
  name: string
  email: string
  password: string
  role: InviteRole
  departmentId: string | null
  titleId: string | null
  reportsTo: string | null
  phone: string | null
  /** Null when this is somebody nobody has filed yet. */
  staffId: string | null
}

function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

export function validateInvite(raw: RawInvite): ValidInvite {
  const name = clean(raw.name)
  if (!name) throw new Error('Name is required')

  const email = clean(raw.email)?.toLowerCase() ?? null
  if (!email) throw new Error('Email is required')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('That email does not look right')
  }

  // Not trimmed: a leading or trailing space is a legitimate character in a
  // password, and silently eating it would lock them out on their first try.
  const password = raw.password ?? ''
  if (password === '') throw new Error('Password is required')
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  }

  const role = clean(raw.role)
  if (!role || !(INVITE_ROLES as readonly string[]).includes(role)) {
    throw new Error('Pick a role')
  }

  const departmentId = clean(raw.departmentId)
  const staffId = clean(raw.staffId)

  // The users table carries this as a CHECK; saying it here means the message
  // names the field rather than the constraint.
  if (role === 'dept_manager' && !departmentId) {
    throw new Error('A department manager needs a department')
  }
  // A brand-new person becomes an hr_staff_costs row, where department is
  // NOT NULL. Somebody already on the roster keeps theirs if none is picked.
  if (!staffId && !departmentId) {
    throw new Error('A new person needs a department')
  }

  return {
    name,
    email,
    password,
    role: role as InviteRole,
    departmentId,
    titleId: clean(raw.titleId),
    reportsTo: clean(raw.reportsTo),
    phone: clean(raw.phone),
    staffId,
  }
}
