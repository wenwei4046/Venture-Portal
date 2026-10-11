/**
 * The portal's Web Push identity (2026-10-11 — the user: "铃铛 + 手机推送").
 *
 * The public key is not secret: every phone that turns notifications on is
 * handed it, and the push service then takes messages for that phone only
 * when they are signed with its private half — `VAPID_PRIVATE_KEY`, set on the
 * server (Vercel's environment, `.env.local`), never in the repo. With no
 * private key the bells still work and nothing is pushed.
 */
export const VAPID_PUBLIC_KEY = 'BN2iKzICvLSBGFrNQlxdsqZLx9zGAZic45-F9GiBpvAbyZ2bSUf_3AxHB7dTYRTOlHkkY5ipzVPPyu1wUTHT02E'

/** Who a push service may write to about this sender (RFC 8292's `sub`). */
export const VAPID_SUBJECT = 'https://venture-portal-chi.vercel.app'

/** The apps a phone turns notifications on in. */
export type PushApp = 'revenue' | 'hr'
