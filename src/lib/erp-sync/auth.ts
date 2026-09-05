/**
 * How the ERP proves it is the ERP.
 *
 * The caller is a DATABASE (pg_net inside the ERP's Postgres), not a person
 * with a session, so the receiver checks a static shared secret — the same
 * scheme the ERP's own mirror receivers use (`x-sync-secret`, compared in
 * constant time, failing CLOSED when the secret is unset). `Authorization:
 * Bearer` is accepted too for anything that is not pg_net.
 *
 * The secret lives in ERP_SYNC_SECRET on the portal (Vercel env) and in the
 * ERP database's sync config; it never appears in either repository.
 */

import { timingSafeEqual } from 'node:crypto'

/** Short or placeholder values must not open the door by accident. */
export const ERP_SYNC_SECRET_MIN_LENGTH = 32

export function secretConfigured(secret: string | undefined | null): secret is string {
  return typeof secret === 'string' && secret.trim().length >= ERP_SYNC_SECRET_MIN_LENGTH
}

/** The secret the request carries, or '' when it carries none. */
export function providedSecret(headers: Headers): string {
  const direct = headers.get('x-sync-secret')
  if (direct && direct.trim() !== '') return direct.trim()
  const auth = headers.get('authorization') ?? ''
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim())
  return m ? m[1].trim() : ''
}

/** Constant-time equality. A length mismatch is a mismatch, and not a secret. */
export function secretMatches(provided: string, secret: string): boolean {
  if (provided.length === 0 || secret.length === 0) return false
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(secret, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
