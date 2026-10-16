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

/**
 * How the login is handed over (2026-10-16, the user: "Invite 选项…两个选择：
 * 1. Send Invite Link 2. 直接帮它 set password"). `link`: Supabase emails them a
 * link, they choose their own password on /welcome and the login is theirs
 * from then on. `password`: HR sets one now and passes it on, as before.
 */
export type InviteMode = 'link' | 'password'

export const isInviteMode = (value: unknown): value is InviteMode => value === 'link' || value === 'password'

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
  /** `password` when absent — the window's only way until 2026-10-16. */
  mode?: string | null
  password?: string | null
  cells?: unknown
}

export interface ValidInvite {
  staffId: string
  email: string
  mode: InviteMode
  /** '' for a link: they choose it themselves. */
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

  const mode = raw.mode === undefined || raw.mode === null ? 'password' : raw.mode
  if (!isInviteMode(mode)) throw new Error('Reload the page and try again.')

  // Not trimmed: a leading or trailing space is a legitimate character in a
  // password, and silently eating it would lock them out on their first try.
  // A link carries none — whatever the form still held is dropped.
  const password = mode === 'link' ? '' : (raw.password ?? '')
  if (mode === 'password' && password.length < MIN_PASSWORD_LENGTH) {
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

  return { staffId, email, mode, password, cells }
}

/* ── The link (2026-10-16) ─────────────────────────────────────────────── */

/**
 * Where the link lands: our own page, the token's hash in its query. It never
 * goes through Supabase's redirect (production's Site URL was still
 * localhost:3000 with no Redirect URLs), and nothing is spent by opening it —
 * the token is checked only when they press Activate, so a mail scanner that
 * fetches every link cannot use it up. `host` is the request's own, as the ERP
 * receiver's address is made (`receiverUrlFor`).
 */
export function welcomeLink(host: string | null | undefined, tokenHash: string): string {
  const h = (host ?? '').trim() || 'localhost:3000'
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(h)
  return `${local ? 'http' : 'https'}://${h}/welcome?token_hash=${encodeURIComponent(tokenHash)}&type=invite`
}

/**
 * Why Supabase did not email it, said so HR knows what to do with the link
 * instead. Its own sender (no SMTP of ours) writes only to members of the
 * Supabase organisation, and two an hour.
 */
export function emailRefusal(code: string | null | undefined): string {
  if (code === 'email_address_not_authorized') return 'Supabase can only email the team’s own addresses until an email service is connected.'
  if (code === 'over_email_send_rate_limit') return 'Supabase has sent as many emails as it may this hour.'
  if (code === 'email_address_invalid') return 'Supabase would not send to that address.'
  return 'Supabase could not send the email.'
}

/** A token hash as Supabase makes it (hex today) — anything else is not worth a round trip. */
export function isTokenHash(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,200}$/.test(value)
}

/** The first thing wrong with the two password fields on /welcome, or ''. */
export function welcomeBlocker(password: string, confirm: string): string {
  if (password.length < MIN_PASSWORD_LENGTH) return `Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`
  if (password !== confirm) return 'The two passwords are not the same.'
  return ''
}
