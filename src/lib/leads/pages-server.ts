import 'server-only'
import { GRAPH_VERSION } from '@/lib/whatsapp/send'
import { pageToken } from '@/lib/messenger/send'
import type { ManagedPage } from './pages'

/**
 * Settings › Connect page (2026-11-02 — the user: "System user's Pages"): the Pages the system user manages
 * (META_SYSTEM_USER_TOKEN, env only — the token the webhook and the replies already use), each with its linked
 * Instagram account; and, once a Page is connected, its webhook fields subscribed to the app. No Meta login and no
 * callback: a Page the system user is not given in Business Settings is not offered.
 */

const graph = (path: string) => `https://graph.facebook.com/${GRAPH_VERSION}/${path}`

/** The webhook fields Lead View reads (lead-view.md › THE PAGE'S OWN REPLIES AND STANDBY, LABELS AND READ TICKS). */
export const PAGE_FIELDS = ['messages', 'messaging_postbacks', 'messaging_referrals', 'message_deliveries', 'message_reads', 'standby', 'message_echoes'] as const

type Raw = { id?: string; name?: string; fan_count?: number; followers_count?: number; instagram_business_account?: { id?: string; username?: string; followers_count?: number } }

let kept: { at: number; pages: ManagedPage[] } | null = null

/**
 * Graph's me/accounts, as ManagedPage — null when there is no token or Meta did not answer (nothing is said lost).
 * Kept a minute per server instance (Settings and Reply rules both ask); `fresh` asks again (Connect, Reconnect).
 */
export async function managedPages(fresh = false, fetchImpl: typeof fetch = fetch): Promise<ManagedPage[] | null> {
  const token = process.env.META_SYSTEM_USER_TOKEN?.trim()
  if (!token) return null
  if (!fresh && kept && Date.now() - kept.at < 60_000) return kept.pages
  const out: ManagedPage[] = []
  let url: string | null = graph('me/accounts?fields=id,name,fan_count,followers_count,instagram_business_account{id,username,followers_count}&limit=100')
  try {
    for (let n = 0; url && n < 5; n++) {
      const res: Response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(6000) })
      const json = (await res.json().catch(() => null)) as { data?: Raw[]; paging?: { next?: string }; error?: { code?: number } } | null
      if (!res.ok || !json?.data) {
        console.error('[lead-pages] me/accounts refused', res.status, json?.error?.code)
        return null
      }
      for (const p of json.data) {
        if (!p.id || !/^\d{5,30}$/.test(p.id)) continue
        const ig = p.instagram_business_account
        out.push({
          id: p.id,
          name: p.name ?? '',
          followers: p.followers_count ?? p.fan_count ?? null,
          ig: ig?.id && /^\d{5,30}$/.test(ig.id) ? { id: ig.id, username: ig.username ?? ig.id, followers: ig.followers_count ?? null } : null,
        })
      }
      url = json.paging?.next ?? null
    }
  } catch {
    return null
  }
  kept = { at: Date.now(), pages: out }
  return out
}

/** Subscribe a Page's webhook fields to the app (idempotent at Meta). Its words when Meta refuses; null when done. */
export async function subscribePage(pageId: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const system = process.env.META_SYSTEM_USER_TOKEN?.trim()
  if (!system) return 'Meta is not connected — the system user token (META_SYSTEM_USER_TOKEN) is not set.'
  const token = await pageToken(pageId, system, fetchImpl)
  if (!token) return 'Meta gave no access to that Page — check it is assigned to the system user in Business Settings.'
  try {
    const res = await fetchImpl(graph(`${encodeURIComponent(pageId)}/subscribed_apps`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscribed_fields: PAGE_FIELDS.join(',') }),
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    })
    const json = (await res.json().catch(() => null)) as { success?: boolean; error?: { message?: string } } | null
    if (res.ok && json?.success) return null
    console.error('[lead-pages] subscribed_apps refused', res.status, json?.error?.message)
    return 'Meta did not subscribe the Page to new messages. Please try again.'
  } catch {
    return 'Meta could not be reached. Please try again.'
  }
}
