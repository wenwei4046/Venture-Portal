// What an invite has to satisfy before anybody touches the database.
//
// Since 2026-10-08 (the People Management revamp) an invite is a LOGIN for
// somebody already on the roster: pick the person, set an email and a
// password, and what they may do comes from their title's permission template
// — plus, optionally, a cell or two raised or lowered for them alone. There is
// no role to pick ("到最后是跟着 title 的 permission 走", user), no name or
// department to type (the People record owns those), and nobody new is made
// here: somebody not on the roster is added with + Add person first.
//
// Pure, so the rules — and the drawer's blocker line, which says the same thing
// before the button is pressed — are tested on their own.

import { isAction, isScope, type Action, type Scope } from '@/lib/permission-matrix'

/** Supabase hard-floors this and answers a shorter one with a 422. */
export const MIN_PASSWORD_LENGTH = 6

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** No 0/O, 1/l/I — a password read out over the phone. */
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

export interface InviteCell {
  function_key: string
  action: Action
  /** null = held back from what the template allows (✕). */
  scope: Scope | null
}

export interface RawInvite {
  staffId?: string | null
  email?: string | null
  password?: string | null
  cells?: unknown
}

export interface ValidInvite {
  staffId: string
  email: string
  password: string
  cells: InviteCell[]
}

/**
 * The first thing still missing, worded the way the drawer's footer says it —
 * or '' once Create account may be pressed.
 */
export function inviteBlocker(input: { staffId: string | null; email: string; password: string }): string {
  if (!input.staffId) return 'Pick somebody from the roster'
  if (!EMAIL.test(input.email.trim())) return 'Email is required'
  if (input.password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
  return ''
}

/** 0 empty · 1 too short · 2 long enough · 3 ten or more with a digit and a capital. */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 {
  if (password.length === 0) return 0
  if (password.length < MIN_PASSWORD_LENGTH) return 1
  return password.length >= 10 && /\d/.test(password) && /[A-Z]/.test(password) ? 3 : 2
}

/** `Hv-` and seven characters nobody misreads. */
export function generatePassword(random: () => number = Math.random): string {
  let out = 'Hv-'
  for (let i = 0; i < 7; i++) out += PASSWORD_ALPHABET[Math.floor(random() * PASSWORD_ALPHABET.length)]
  return out
}

export function validateInvite(raw: RawInvite): ValidInvite {
  const staffId = (raw.staffId ?? '').trim()
  if (!staffId || !UUID.test(staffId)) throw new Error('Pick somebody from the roster')

  const email = (raw.email ?? '').trim().toLowerCase()
  if (!email || !EMAIL.test(email)) throw new Error('Email is required')

  // Not trimmed: a leading or trailing space is a legitimate character in a
  // password, and silently eating it would lock them out on their first try.
  const password = raw.password ?? ''
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  }

  if (raw.cells !== undefined && raw.cells !== null && !Array.isArray(raw.cells)) {
    throw new Error('Reload the page and try again.')
  }
  const seen = new Set<string>()
  const cells: InviteCell[] = ((raw.cells ?? []) as unknown[]).map(c => {
    const cell = c as { function_key?: unknown; action?: unknown; scope?: unknown } | null
    if (
      !cell ||
      typeof cell.function_key !== 'string' ||
      !/^[a-z_]{2,40}$/.test(cell.function_key) ||
      !isAction(cell.action) ||
      !(cell.scope === null || isScope(cell.scope))
    ) {
      throw new Error('Reload the page and try again.')
    }
    const key = `${cell.function_key}.${cell.action}`
    if (seen.has(key)) throw new Error('Reload the page and try again.')
    seen.add(key)
    return { function_key: cell.function_key, action: cell.action, scope: cell.scope as Scope | null }
  })
  if (cells.length > 200) throw new Error('Reload the page and try again.')

  return { staffId, email, password, cells }
}
