// Request to change email (2026-10-16 — the user: a person's email is the one they sign in with, "不能乱改的，除非他们
// request to change email … 在他们的 app 那边，同时有多一个 option"; HR approves it on Attendance › Requests). What a
// new email must satisfy before the database is asked — the same words `att_profile_changes()` refuses with
// (mig 20261016190000) — and the request as their app shows it: waiting for HR, declined with HR's note, or done.

/** One request, as `my_email_change()` answers it. */
export interface EmailChange {
  id: string
  ref: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  to: string
  from: string | null
  /** When it was sent, and decided (ISO). */
  at: string | null
  decidedAt: string | null
  /** HR's (or the upline's) words when it was declined. */
  note: string | null
}

/** What the sheet opens on: the email they sign in with, and their latest request. */
export interface MyEmail {
  email: string
  latest: EmailChange | null
}

export type EmailAct = { ok: true; mine: MyEmail } | { ok: false; reason: string }

export const EMAIL_MAX = 254

/** Said to a shared login, and to anybody who reaches the request without a People record naming their login. */
export const SHARED_EMAIL = 'This is a shared login, so its email is not changed here. Request to change email is for a login of your own.'
export const NOT_SENT = 'Your request could not be sent. Please try again.'
export const NOT_READ = 'Your email could not be read. Please try again.'

/** How long a decided request still shows on the sheet. */
const SHOWN_FOR_DAYS = 14

/** The first thing wrong with a new email, as the sheet shows it — or '' once it may be sent. */
export function emailProblem(next: string, current: string): string {
  const e = next.trim().toLowerCase()
  if (!e) return 'Enter the new email.'
  if (e.length > EMAIL_MAX) return 'That email is too long.'
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return 'Enter an email address like name@houzs.my.'
  if (e === current.trim().toLowerCase()) return 'That is already the email you sign in with.'
  return ''
}

const STATUSES: ReadonlyArray<EmailChange['status']> = ['pending', 'approved', 'rejected', 'cancelled']
const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

/** The database's answer, read defensively: anything not shaped like a request is none. */
export function emailChangeOf(row: unknown): EmailChange | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const status = STATUSES.find(s => s === r.status)
  if (typeof r.id !== 'string' || !status || typeof r.to !== 'string') return null
  return {
    id: r.id,
    ref: typeof r.ref === 'string' ? r.ref : '',
    status,
    to: r.to,
    from: text(r.from),
    at: text(r.at),
    decidedAt: text(r.decidedAt),
    note: text(r.note),
  }
}

/** The latest request as the sheet draws it, or null when there is nothing to say (withdrawn, or decided long ago). */
export type EmailChangeState =
  | { kind: 'waiting'; to: string; ref: string; at: string | null }
  | { kind: 'declined'; to: string; note: string | null }
  | { kind: 'approved'; to: string }

export function emailChangeState(c: EmailChange | null, now: Date = new Date()): EmailChangeState | null {
  if (!c) return null
  if (c.status === 'pending') return { kind: 'waiting', to: c.to, ref: c.ref, at: c.at }
  if (c.status === 'cancelled') return null
  const decided = c.decidedAt ? Date.parse(c.decidedAt) : NaN
  if (Number.isFinite(decided) && now.getTime() - decided > SHOWN_FOR_DAYS * 86_400_000) return null
  return c.status === 'approved' ? { kind: 'approved', to: c.to } : { kind: 'declined', to: c.to, note: c.note }
}

/** The sheet's words for each state. */
export const EMAIL_WORDS = {
  title: 'Request to change email',
  current: 'You sign in with',
  next: 'New email',
  send: 'Send to HR',
  sending: 'Sending…',
  withdraw: 'Withdraw',
  withdrawing: 'Withdrawing…',
  waiting: 'Waiting for HR',
  declined: 'Declined',
  approved: 'Approved',
  sent: (current: string) => `Sent to HR. Until they approve it, you sign in with ${current}.`,
  approvedLine: (to: string) => `You sign in with ${to} now.`,
} as const
