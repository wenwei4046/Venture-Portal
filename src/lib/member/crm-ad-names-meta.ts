import type { SupabaseClient } from '@supabase/supabase-js'
import { GRAPH_VERSION } from '../whatsapp/send'

/**
 * An ad's name from Ads Manager (2026-10-19; the owner: "为什么在他的customer info 中不会自动显示广告名称", then
 * "做吧"). Meta's message carries the ad's id and headline, never its name; once the system user was given the ad
 * accounts and the app the ads_read use case, the token can ask Graph for it. So a webhook delivery that brought an ad
 * we have no name for asks Meta (best effort, after Meta has its answer) and keeps the name in crm_ad_names as
 * source 'meta'. A manual name wins: an ad that already has a row is never asked, and the write never overwrites.
 * An ad in an account the system user cannot see (a boosted post, another portfolio) answers 100/33: it keeps its
 * headline, is not asked again on this server for six hours, and can still be named by hand.
 */

const AD_ID = /^\d{5,32}$/
const MISS_MS = 6 * 60 * 60_000
const misses = new Map<string, number>()

/** The ad ids a delivery brought, once each, well-formed only. */
export function adIdsOf(messages: Array<{ ad?: { sourceId: string | null } | null }>): string[] {
  return [...new Set(messages.map(m => m.ad?.sourceId?.trim() ?? '').filter(id => AD_ID.test(id)))]
}

/** The ad's name in Ads Manager, or null (no access, no such ad, Meta slow — 3 s). */
export async function metaAdName(adId: string, token: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!AD_ID.test(adId)) return null
  try {
    const res = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSION}/${adId}?fields=name`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    const name = ((await res.json()) as { name?: unknown }).name
    return typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : null
  } catch {
    return null
  }
}

/**
 * Names the ads among `ids` that have no name yet. `db` is the webhook's service-role client, which calls RPCs only
 * (CLAUDE.md › Machine ingest): crm_ads_unnamed and crm_meta_name_ad (mig 20261019100000), the service role's alone.
 * At most five ads a delivery. Never throws.
 */
export async function nameAdsFromMeta(db: SupabaseClient, ids: string[], token: string | undefined, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<number> {
  if (!token || !ids.length) return 0
  try {
    const asked = ids.filter(id => (misses.get(id) ?? 0) <= now).slice(0, 5)
    if (!asked.length) return 0
    const { data, error } = await db.rpc('crm_ads_unnamed', { p_ids: asked })
    if (error || !Array.isArray(data)) return 0
    let named = 0
    for (const id of (data as string[]).filter(a => asked.includes(a))) {
      const name = await metaAdName(id, token, fetchImpl)
      if (!name) { misses.set(id, now + MISS_MS); continue }
      const { data: kept, error: e } = await db.rpc('crm_meta_name_ad', { p_ad: id, p_name: name })
      if (!e && kept === true) named++
    }
    return named
  } catch {
    return 0
  }
}

/** For tests: forget the ads Meta would not name. */
export function forgetAdMisses() { misses.clear() }
