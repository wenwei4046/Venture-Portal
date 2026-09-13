/**
 * How the ERP proves it is the ERP.
 *
 * The caller is a DATABASE (pg_net inside the ERP's Postgres), not a person
 * with a session, so the receiver checks a static shared secret — the same
 * scheme the ERP's own mirror receivers use (`x-sync-secret`, compared in
 * constant time, failing CLOSED when the secret is unset). `Authorization:
 * Bearer` is accepted too for anything that is not pg_net.
 *
 * Which secret (2026-09-13): the key the ERP's Venture Portal Feed page
 * generated and somebody pasted on Fair's Commission Calculation page (kept in
 * Vault, read through erp-sync/feed-key.ts), or ERP_SYNC_SECRET on Vercel if
 * that is set too. Either is accepted; neither appears in any repository.
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

/**
 * The secrets the receiver will accept: every candidate that is a real one
 * (long enough, not a placeholder), trimmed, without repeats. Empty means the
 * feed is not configured and the receiver must answer 503, never open.
 */
export function acceptedSecrets(...candidates: Array<string | null | undefined>): string[] {
  const out: string[] = []
  for (const c of candidates) {
    if (!secretConfigured(c)) continue
    const t = c.trim()
    if (!out.includes(t)) out.push(t)
  }
  return out
}

/** True when the provided secret equals any accepted one. Every candidate is compared. */
export function secretMatchesAny(provided: string, secrets: readonly string[]): boolean {
  let ok = false
  for (const s of secrets) {
    if (secretMatches(provided, s)) ok = true
  }
  return ok
}
