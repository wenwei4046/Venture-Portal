'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { getUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { PushApp } from './config'

/**
 * One's own notifications and phone (2026-10-11, mig 20261011180000): mark
 * them read, turn pushes on or off for this phone. Each asks a signed-in,
 * active account, and the database answers only for that account. While
 * viewing as somebody the server client is read-only and each says so.
 */
type Act = { ok: true } | { ok: false; reason: string }

const B64URL = /^[A-Za-z0-9_-]+$/

/** The session's client; these functions postdate database.types.ts. */
const client = async () => (await createClient()) as unknown as SupabaseClient

async function signedIn(): Promise<boolean> {
  const user = await getUser()
  return !!user?.is_active
}

const reasonOf = (error: { message?: string; code?: string } | null, fallback: string) =>
  error?.code === '42501' || error?.message?.startsWith('Read-only') ? (error.message ?? fallback) : fallback

/** Read: these, or every one of theirs. */
export async function readNotices(ids?: string[] | null): Promise<Act> {
  if (!(await signedIn())) return { ok: false, reason: 'Sign in with an active work account.' }
  const list = ids?.filter(id => /^[0-9a-f-]{36}$/i.test(id)) ?? null
  const db = await client()
  const { error } = await db.rpc('notifications_read', { p_ids: list && list.length ? list : null })
  return error ? { ok: false, reason: reasonOf(error, 'The notifications could not be marked. Please try again.') } : { ok: true }
}

/** This phone, for this app: send it pushes. */
export async function savePushSubscription(input: { endpoint: string; p256dh: string; auth: string; app: PushApp }): Promise<Act> {
  if (!(await signedIn())) return { ok: false, reason: 'Sign in with an active work account.' }
  if (typeof input?.endpoint !== 'string' || !input.endpoint.startsWith('https://') || input.endpoint.length > 1000) return { ok: false, reason: 'This phone gave no push address.' }
  if (!B64URL.test(input.p256dh ?? '') || !B64URL.test(input.auth ?? '')) return { ok: false, reason: 'This phone gave no push keys.' }
  if (input.app !== 'revenue' && input.app !== 'hr') return { ok: false, reason: 'Say which app this phone is for.' }
  const db = await client()
  const { error } = await db.rpc('push_subscribe', { p_endpoint: input.endpoint, p_p256dh: input.p256dh, p_auth: input.auth, p_app: input.app })
  // The database's own words go to the server's log — the phone is told only the plain reason.
  if (error) console.error('[push] push_subscribe refused', JSON.stringify({ code: error.code, message: error.message }))
  return error ? { ok: false, reason: reasonOf(error, 'Notifications could not be turned on. Please try again.') } : { ok: true }
}

/** This phone: no more pushes. */
export async function removePushSubscription(endpoint: string): Promise<Act> {
  if (!(await signedIn())) return { ok: false, reason: 'Sign in with an active work account.' }
  if (typeof endpoint !== 'string' || !endpoint) return { ok: true }
  const db = await client()
  const { error } = await db.rpc('push_unsubscribe', { p_endpoint: endpoint })
  return error ? { ok: false, reason: reasonOf(error, 'Notifications could not be turned off. Please try again.') } : { ok: true }
}

/**
 * A phone that could not turn its notifications on says why (2026-10-11): the
 * reason goes to the server's own log (Vercel's runtime log) with the browser
 * it came from — nothing is stored. Signed-in accounts only.
 */
export async function reportPushTrouble(t: { app: PushApp; stage: string; message: string }): Promise<void> {
  const user = await getUser()
  if (!user?.is_active) return
  const ua = (await headers()).get('user-agent') ?? ''
  console.error('[push] trouble', JSON.stringify({
    user: user.id,
    app: String(t?.app ?? '').slice(0, 10),
    stage: String(t?.stage ?? '').slice(0, 12),
    message: String(t?.message ?? '').slice(0, 300),
    ua: ua.slice(0, 220),
  }))
}
