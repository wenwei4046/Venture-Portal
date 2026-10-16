import type { SupabaseClient } from '@supabase/supabase-js'
import type { PushApp } from '@/lib/push/config'
import { createClient } from '@/lib/supabase/client'

/**
 * The portal's phone notifications (2026-10-16 — the user's iPhone opened the Principal's own view, the portal, which
 * had no way to turn them on: the phone was never asked, so the app never showed in Settings › Notifications and no
 * push could reach it). The first open's question (PortalPushAsk) and More's *Phone notifications* (PortalPushRow).
 */

/**
 * The app a tapped notice opens in: the HR app's places — a booking, a hire, a request, a memo — which the HR app
 * shows for whoever it opens for and sends anybody else to their dashboard; the CRM's open in the Revenue app either
 * way (lib/push/notices.ts). The same as a phone the Principal turned them on in through the HR app.
 */
export const PORTAL_PUSH_APP: PushApp = 'hr'

export const PORTAL_PUSH_BODY = 'Meetings, memos, requests and your customers’ messages reach this phone the moment they happen — even with the app closed.'

/*
 * Signed up from the browser, not through a Server Action: every open signs a phone that said yes up again
 * (`healPush`), and in the portal nothing may fire a Server Action on its own — a navigation that interrupts one
 * refreshes the page it lands on (speed.md, lib/page-view.ts). `push_subscribe` / `push_unsubscribe` take the account
 * from the session (`auth.uid()`, an active account) and the table checks the address and the keys, as
 * `savePushSubscription` would.
 */
type Saved = { ok: true } | { ok: false; reason: string }

/** The session's client; these functions postdate database.types.ts. */
const client = () => createClient() as unknown as SupabaseClient

const plain = (error: { code?: string }, fallback: string) =>
  error.code === '42501' ? 'Sign in with an active work account.' : fallback

/** This phone, for this app: send it pushes. */
export async function savePushFromBrowser(s: { endpoint: string; p256dh: string; auth: string; app: PushApp }): Promise<Saved> {
  const { error } = await client().rpc('push_subscribe', { p_endpoint: s.endpoint, p_p256dh: s.p256dh, p_auth: s.auth, p_app: s.app })
  return error ? { ok: false, reason: plain(error, 'Notifications could not be turned on. Please try again.') } : { ok: true }
}

/** This phone: no more pushes. */
export async function removePushFromBrowser(endpoint: string): Promise<Saved> {
  const { error } = await client().rpc('push_unsubscribe', { p_endpoint: endpoint })
  return error ? { ok: false, reason: plain(error, 'Notifications could not be turned off. Please try again.') } : { ok: true }
}
