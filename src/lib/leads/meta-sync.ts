import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { pageToken } from '@/lib/messenger/send'
import { GRAPH_VERSION } from '@/lib/whatsapp/send'

/**
 * Lead View the same as Messenger (mig 20261028100000): a new conversation's earlier messages, Messenger's own unread
 * counts, and "seen" when a chat is opened. Every call here asks Meta with the Page's token (the system user's) and
 * never throws — Meta not answering leaves Lead View as it was.
 */

const graph = (path: string) => `https://graph.facebook.com/${GRAPH_VERSION}/${path}`

async function getJson(url: string, token: string, fetchImpl: typeof fetch): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    return (await res.json()) as Record<string, unknown>
  } catch {
    return null
  }
}

export interface GraphMessage {
  id: string
  from?: { id?: string }
  created_time?: string
  message?: string
  attachments?: { data?: Array<{ mime_type?: string; name?: string; image_data?: { url?: string }; video_data?: { url?: string }; file_url?: string; generic_template?: GraphCard }> }
  shares?: { data?: Array<{ name?: string; link?: string }> }
}

/** A card the Page sent, as the Graph reads it back (its webhook echo is a `template` attachment — page-events.ts). */
export interface GraphCard { title?: string; subtitle?: string; cta?: Array<{ title?: string }> }

/** A card's words and buttons ("▸ <title>"), as `templateText` writes a webhook's card. Null for none. */
export function cardText(g: GraphCard | undefined): string | null {
  if (!g) return null
  const parts = [g.title?.trim(), g.subtitle?.trim(), ...(g.cta ?? []).map(c => c.title?.trim()).filter(Boolean).map(t => '▸ ' + t)]
  const text = parts.filter(Boolean).join('\n')
  return text ? text.slice(0, 2000) : null
}

/** What a message carried when it had no words: a card, a shared post ("[Shared] <its name>"), else a file's label. */
export function wordlessBody(m: GraphMessage): string {
  const a = m.attachments?.data?.[0]
  const card = cardText(a?.generic_template)
  if (card) return card
  if (a) return placeholder(a)
  const share = m.shares?.data?.[0]
  if (share?.name || share?.link) return ['[Shared]', share.name?.trim(), share.link].filter(Boolean).join(' ')
  return '[Message]'
}

export interface HistoryMessage { mid: string; in: boolean; at: string; body: string; mediaUrl: string | null }

/** Meta's own CDN only — an address anything else wrote is not kept. */
export function metaCdn(url: string | null | undefined): string | null {
  return url && /^https:\/\/[A-Za-z0-9.-]+\.(fbcdn\.net|fbsbx\.com|facebook\.com)\//.test(url) ? url.slice(0, 2000) : null
}

function placeholder(a: { mime_type?: string; name?: string }): string {
  const mime = a.mime_type ?? ''
  if (mime.startsWith('image/')) return '[Photo]'
  if (mime.startsWith('video/')) return '[Video]'
  if (mime.startsWith('audio/')) return '[Voice message]'
  return '[File]' + (a.name ? ' ' + a.name : '')
}

/** A conversation's messages from the Graph, as lead_ingest_history takes them, oldest first. */
export function historyOf(messages: GraphMessage[], pageId: string): HistoryMessage[] {
  return messages
    .filter(m => m.id && m.created_time)
    .map(m => {
      const a = m.attachments?.data?.[0]
      return {
        mid: m.id,
        in: m.from?.id !== pageId,
        at: m.created_time as string,
        body: ((m.message ?? '').trim() || wordlessBody(m)).slice(0, 2000),
        mediaUrl: a && !a.generic_template ? metaCdn(a.image_data?.url ?? a.video_data?.url ?? a.file_url) : null,
      }
    })
    .sort((x, y) => Date.parse(x.at) - Date.parse(y.at))
}

/** One customer's conversation's messages from Meta (at most 5 pages of 100). Null when Meta did not answer. */
async function conversationMessages(pageId: string, psid: string, token: string, fetchImpl: typeof fetch): Promise<GraphMessage[] | null> {
  const conv = await getJson(graph(`${encodeURIComponent(pageId)}/conversations?platform=messenger&user_id=${encodeURIComponent(psid)}&fields=id`), token, fetchImpl)
  const id = (conv?.data as Array<{ id?: string }> | undefined)?.[0]?.id
  if (!id) return null
  const out: GraphMessage[] = []
  let url: string | null = graph(`${encodeURIComponent(id)}/messages?fields=id,from,created_time,message,attachments{mime_type,image_data,video_data,file_url,name,generic_template},shares{name,link}&limit=100`)
  for (let i = 0; url && i < 5; i++) {
    const page = await getJson(url, token, fetchImpl)
    if (!page) return out.length ? out : null
    out.push(...((page.data as GraphMessage[] | undefined) ?? []))
    url = ((page.paging as { next?: string } | undefined)?.next) ?? null
  }
  return out
}

/**
 * The conversations a webhook delivery reached that Lead View has never filled in: their earlier messages from Meta,
 * handed to lead_ingest_history (the service role's alone — the webhook's client). A conversation Meta did not answer
 * for stays unfilled and is asked again on its next message. Returns how many messages were added.
 */
export async function fillHistory(client: SupabaseClient, contacts: string[], systemToken: string | undefined, fetchImpl: typeof fetch = fetch): Promise<number> {
  if (!contacts.length || !systemToken) return 0
  const wanted = await client.rpc('lead_history_wanted', { p_contacts: contacts })
  if (wanted.error) {
    console.error('lead_history_wanted failed:', wanted.error.message)
    return 0
  }
  let added = 0
  for (const c of (wanted.data ?? []) as Array<{ id: string; pageId: string; psid: string }>) {
    const token = await pageToken(c.pageId, systemToken, fetchImpl)
    if (!token) continue
    const messages = await conversationMessages(c.pageId, c.psid, token, fetchImpl)
    if (!messages) continue
    const r = await client.rpc('lead_ingest_history', { p_contact: c.id, p_messages: historyOf(messages, c.pageId) })
    if (r.error) console.error('lead_ingest_history failed:', r.error.message)
    else added += Number(r.data ?? 0)
  }
  return added
}

/** "pageId:psid" → Messenger's unread count, for the conversations Meta lists first (the newest 200 per Page). */
export type MetaUnread = Map<string, number>

const UNREAD_TTL = 10_000
const unreadCache = new Map<string, { at: number; counts: Map<string, number> }>()

/** One Page's unread counts as Business Suite shows them, kept 10 seconds per server instance. Null when Meta did not answer. */
async function pageUnread(pageId: string, systemToken: string, fetchImpl: typeof fetch, now: number): Promise<Map<string, number> | null> {
  const kept = unreadCache.get(pageId)
  if (kept && now - kept.at < UNREAD_TTL) return kept.counts
  const token = await pageToken(pageId, systemToken, fetchImpl)
  if (!token) return null
  const counts = new Map<string, number>()
  let url: string | null = graph(`${encodeURIComponent(pageId)}/conversations?platform=messenger&fields=participants,unread_count&limit=100`)
  for (let i = 0; url && i < 2; i++) {
    const page = await getJson(url, token, fetchImpl)
    if (!page) return i ? counts : null
    for (const conv of (page.data as Array<{ participants?: { data?: Array<{ id?: string }> }; unread_count?: number }> | undefined) ?? []) {
      const who = conv.participants?.data?.find(p => p.id && p.id !== pageId)?.id
      if (who) counts.set(who, Number(conv.unread_count ?? 0))
    }
    url = ((page.paging as { next?: string } | undefined)?.next) ?? null
  }
  unreadCache.set(pageId, { at: now, counts })
  return counts
}

/** Messenger's own unread counts for these Pages. A Page Meta did not answer for is left out (Lead View's own count stands). */
export async function metaUnread(pageIds: string[], systemToken: string | undefined, fetchImpl: typeof fetch = fetch, now: number = Date.now()): Promise<MetaUnread> {
  const out: MetaUnread = new Map()
  if (!systemToken) return out
  await Promise.all([...new Set(pageIds.filter(Boolean))].map(async pageId => {
    const counts = await pageUnread(pageId, systemToken, fetchImpl, now)
    for (const [psid, n] of counts ?? []) out.set(`${pageId}:${psid}`, n)
  }))
  return out
}

/** Opening a chat in Lead View marks it read in Messenger, as opening it in Business Suite does. True when Meta took it. */
export async function markSeen(o: { pageId: string | null; psid: string | null }, systemToken: string | undefined, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!o.pageId || !o.psid || !systemToken) return false
  const token = await pageToken(o.pageId, systemToken, fetchImpl)
  if (!token) return false
  try {
    const res = await fetchImpl(graph(`${encodeURIComponent(o.pageId)}/messages`), {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: o.psid }, sender_action: 'mark_seen' }), signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      unreadCache.delete(o.pageId)
      return true
    }
    return false
  } catch {
    return false
  }
}
