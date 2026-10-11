import 'server-only'
import { after } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { VAPID_PUBLIC_KEY, VAPID_SUBJECT, type PushApp } from './config'
import { noticeUrl, type NoticeRef } from './notices'
import { b64url, fromB64url, sendPush, type SendOutcome, type Subscription } from './webpush'

/**
 * Pushing what is due (2026-10-11, mig 20261011180000). The database writes a
 * notice beside the event; this hands what is due to the phones that asked:
 * `push_outbox_take` → one encrypted message per device → `push_outbox_done`.
 *
 * It asks the outbox with a secret only the server holds — HMAC of the VAPID
 * private key, whose sha256 the database keeps — through the publishable key
 * with no session, so it runs the same after a portal write, a guest-link
 * booking or the hourly sweep. Never the service role. With no private key set
 * it does nothing; it never throws into the work that called it.
 */

type Due = { id: string; title: string; body: string; refKind: NoticeRef; refId: string; subs: Array<Subscription & { app: PushApp }> }

function outboxClient(): SupabaseClient {
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => [], setAll: () => {} },
  }) as unknown as SupabaseClient
}

/** The outbox's secret, made from the private key (so one secret is set, not two). */
export async function outboxSecret(privateKey: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', fromB64url(privateKey) as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('push-outbox'))))
}

function dueFromRow(v: unknown): Due[] {
  if (!Array.isArray(v)) return []
  return v.flatMap(x => {
    const n = x as Partial<Due> & { subs?: unknown }
    if (typeof n?.id !== 'string' || !Array.isArray(n.subs)) return []
    const subs = n.subs.filter((s): s is Subscription & { app: PushApp } =>
      !!s && typeof s.endpoint === 'string' && typeof s.p256dh === 'string' && typeof s.auth === 'string' && (s.app === 'revenue' || s.app === 'hr'))
    return [{ id: n.id, title: String(n.title ?? ''), body: String(n.body ?? ''), refKind: n.refKind as NoticeRef, refId: String(n.refId ?? ''), subs }]
  })
}

/**
 * Send what is due, a batch or two. A notice counts as sent once a device took
 * it or every device is gone; one a push service turned away for now (a 429, a
 * 5xx) is left for the next round — the device shows a repeat by its tag once.
 */
export async function flushPush(opts: { client?: SupabaseClient; fetcher?: typeof fetch; rounds?: number } = {}): Promise<{ sent: number; gone: number } | null> {
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!privateKey) return null
  try {
    const db = opts.client ?? outboxClient()
    const secret = await outboxSecret(privateKey)
    const keys = { publicKey: VAPID_PUBLIC_KEY, privateKey }
    let sent = 0
    let gone = 0
    for (let round = 0; round < (opts.rounds ?? 3); round++) {
      const take = await db.rpc('push_outbox_take', { p_secret: secret, p_limit: 50 })
      if (take.error) {
        console.error('Push outbox could not be read', take.error.code ?? 'unknown')
        return { sent, gone }
      }
      const due = dueFromRow(take.data)
      if (!due.length) break
      const done: string[] = []
      const goneEndpoints: string[] = []
      await Promise.all(due.map(async n => {
        const outcomes: SendOutcome[] = await Promise.all(n.subs.map(s =>
          sendPush(s, { title: n.title, body: n.body, url: noticeUrl(n, s.app), tag: n.id }, keys, VAPID_SUBJECT, { fetcher: opts.fetcher })
            .catch((): SendOutcome => ({ ok: false, gone: false, status: 0 }))))
        outcomes.forEach((o, i) => { if (!o.ok && o.gone) goneEndpoints.push(n.subs[i].endpoint) })
        if (outcomes.some(o => o.ok) || outcomes.every(o => !o.ok && o.gone)) done.push(n.id)
      }))
      const fin = await db.rpc('push_outbox_done', { p_secret: secret, p_sent: done, p_gone: goneEndpoints })
      if (fin.error) console.error('Push outbox could not be marked', fin.error.code ?? 'unknown')
      sent += done.length
      gone += goneEndpoints.length
      if (due.length < 50) break
    }
    return { sent, gone }
  } catch (error) {
    console.error('Push could not be sent', error instanceof Error ? error.name : 'unknown')
    return null
  }
}

/**
 * After a write that may have told somebody something: push it once the answer has gone back, so the
 * person pressing never waits on a push service. Outside a request (a test) it does nothing; the hourly
 * sweep (/api/member-queue) takes whatever is left.
 */
export function pushSoon(): void {
  if (!process.env.VAPID_PRIVATE_KEY) return
  try {
    after(() => flushPush().then(() => undefined))
  } catch {
    // Not inside a request.
  }
}
