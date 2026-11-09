/**
 * Who Facebook says the CRM's Pages can no longer reply to — the people a Page blocked (the owner, 2026-11-08: "若我在 fb
 * 已经 block 了这个人，对话框写 block，并放到 block 分类里"). Meta sends no webhook for a block; a conversation's `can_reply`
 * turns false instead. The hourly sweep reads every Page's conversations (newest first, a bounded number of pages) and
 * hands the blocked PSIDs to `crm_set_messenger_blocked` (mig 20261108150000). Read-only towards Meta.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { crmPages } from '@/lib/member/crm-ad-names-meta'
import { pageToken } from './send'

const GRAPH = 'https://graph.facebook.com/v21.0'
/** At most this many pages of 100 conversations a Page each hour; past it nobody is unblocked (the list was not whole). */
export const MAX_PAGES = 30

interface ConversationPage {
  data?: { can_reply?: boolean; participants?: { data?: { id?: string }[] } }[]
  paging?: { next?: string }
  error?: unknown
}

/**
 * Every folder a Page's conversations sit in. The list reads the inbox alone unless a folder is named, and a person blocked
 * from Business Suite is moved to its spam ("垃圾信息"), which the API calls `other` (the owner, 2026-11-09: Bailan Apo,
 * blocked and moved to spam, never reached the CRM — `can_reply` false, in `other`, outside the inbox the sweep read).
 */
export const FOLDERS = ['inbox', 'other', 'spam', 'page_done'] as const

/** The PSIDs a Page cannot reply to, from its conversations in every folder; `complete` when every one was read. */
export async function blockedOnPage(pageId: string, token: string, fetchImpl: typeof fetch = fetch, maxPages = MAX_PAGES): Promise<{ psids: string[]; complete: boolean } | null> {
  const psids = new Set<string>()
  let complete = true
  for (const folder of FOLDERS) {
    const got = await blockedInFolder(pageId, token, folder, fetchImpl, maxPages)
    if (!got) return null
    got.psids.forEach(p => psids.add(p))
    complete &&= got.complete
  }
  return { psids: [...psids], complete }
}

async function blockedInFolder(pageId: string, token: string, folder: string, fetchImpl: typeof fetch, maxPages: number): Promise<{ psids: string[]; complete: boolean } | null> {
  const psids = new Set<string>()
  let url: string | undefined = `${GRAPH}/${pageId}/conversations?platform=messenger&folder=${folder}&fields=can_reply,participants&limit=100`
  for (let n = 0; url && n < maxPages; n++) {
    const r = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
    const j = (await r.json().catch(() => null)) as ConversationPage | null
    if (!r.ok || !j || j.error) return null
    for (const c of j.data ?? []) {
      if (c.can_reply !== false) continue
      for (const p of c.participants?.data ?? []) if (p.id && p.id !== pageId && /^\d+$/.test(p.id)) psids.add(p.id)
    }
    url = j.paging?.next
  }
  return { psids: [...psids], complete: !url }
}

/** The sweep: every CRM Page, its blocked people kept on their customers. A count of customers changed. */
export async function refreshMessengerBlocked(db: SupabaseClient, systemToken: string | undefined, fetchImpl: typeof fetch = fetch): Promise<number> {
  if (!systemToken) return 0
  let changed = 0
  for (const page of crmPages()) {
    try {
      const token = await pageToken(page, systemToken, fetchImpl)
      if (!token) continue
      const got = await blockedOnPage(page, token, fetchImpl)
      if (!got) continue
      const { data, error } = await db.rpc('crm_set_messenger_blocked', { p_page: page, p_psids: got.psids, p_complete: got.complete })
      if (!error && typeof data === 'number') changed += data
    } catch {
      // Best effort: the next hour asks again.
    }
  }
  return changed
}
