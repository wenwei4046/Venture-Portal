// Lead View › Instagram Direct in (2026-10-27, mig 20261027110010). Instagram messaging through Facebook login reaches
// the Messenger webhook as object "instagram": each entry is one of our Instagram professional accounts, each sender an
// Instagram-scoped id (IGSID), and the events are shaped as Messenger's — so Messenger's parser reads them, the entry's
// id being the Instagram account where Messenger's is the Page. Everything Instagram sends is Lead View's (the CRM takes
// no Instagram). A reply goes out through the Facebook Page the account is linked to (lib/leads/messenger.ts › deliver,
// the Page kept on the conversation by the ingest), so only the way IN is new here.

import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseMessengerDelivery, type MsgInbound } from '@/lib/messenger/webhook'
import { pageToken } from '@/lib/messenger/send'
import { GRAPH_VERSION } from '@/lib/whatsapp/send'
import { adAccountName } from './ad-account'
import { sendLeadOutbox } from './messenger-outbox'

const graph = (path: string) => `https://graph.facebook.com/${GRAPH_VERSION}/${path}`

/** Instagram's messages from a webhook delivery; none unless it is object "instagram". `pageId` holds the IG account. */
export function parseInstagramDelivery(body: unknown): MsgInbound[] {
  const b = body as { object?: string } | null
  if (b?.object !== 'instagram') return []
  return parseMessengerDelivery({ ...b, object: 'page' }).messages
}

let pagesOf: { at: number; map: Map<string, string> } | null = null
const PAGES_MS = 10 * 60 * 1000

/** Instagram account → the Facebook Page it is linked to, as the system user sees them; kept ten minutes. */
export async function instagramPages(systemToken: string, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<Map<string, string>> {
  if (pagesOf && now - pagesOf.at < PAGES_MS) return pagesOf.map
  const map = new Map<string, string>()
  try {
    const res = await fetchImpl(graph('me/accounts?fields=id,instagram_business_account&limit=100'), {
      headers: { Authorization: `Bearer ${systemToken}` }, signal: AbortSignal.timeout(3000),
    })
    const json = res.ok ? ((await res.json()) as { data?: Array<{ id?: string; instagram_business_account?: { id?: string } }> }) : null
    for (const p of json?.data ?? []) if (p.id && p.instagram_business_account?.id) map.set(p.instagram_business_account.id, p.id)
  } catch {
    // Meta did not answer: no names this time; the messages still go in.
  }
  pagesOf = { at: now, map }
  return map
}

/** The Instagram user's name, else their username, or null — asked with the linked Page's token. */
export async function instagramName(igsid: string, token: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!/^[0-9]{5,32}$/.test(igsid)) return null
  try {
    const res = await fetchImpl(graph(`${igsid}?fields=name,username`), {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(3000),
    })
    const json = res.ok ? ((await res.json()) as { name?: string; username?: string }) : null
    return json?.name?.trim() || json?.username?.trim() || null
  } catch {
    return null
  }
}

/**
 * Takes a delivery's Instagram messages into Lead View: names and ad accounts asked of Meta (best effort), then the one
 * ingest function, then — once Meta has its answer — the templates' messages. Answers what the ingest said, or its error.
 */
export async function takeInstagram(
  client: SupabaseClient,
  messages: MsgInbound[],
  systemToken: string | undefined,
  later: (job: () => Promise<unknown>) => void,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  if (!messages.length) return { ok: true, data: { messages: 0 } }
  const rows = await Promise.all(messages.map(async m => {
    let name: string | null = null
    if (systemToken) {
      const page = (await instagramPages(systemToken)).get(m.pageId)
      const token = page ? await pageToken(page, systemToken) : null
      name = token ? await instagramName(m.psid, token) : null
    }
    const ad = m.ad?.sourceId ? { ...m.ad, account: await adAccountName(m.ad.sourceId, systemToken) } : m.ad
    return { ...m, name, ad }
  }))
  const { data, error } = await client.rpc('lead_ingest_instagram', { p_messages: rows })
  if (error) return { ok: false, error: error.message }
  const contacts = ((data as { contacts?: string[] } | null)?.contacts ?? []).filter(Boolean)
  if (contacts.length) later(() => sendLeadOutbox(client, contacts, systemToken))
  return { ok: true, data }
}

/** For tests: forget the accounts' Pages. */
export function forgetInstagramPages(): void {
  pagesOf = null
}
