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

export interface MetaAd { name: string | null; status: string | null }

function adOf(raw: unknown): MetaAd {
  const o = (raw ?? {}) as { name?: unknown; effective_status?: unknown }
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 120) : null
  const status = typeof o.effective_status === 'string' && o.effective_status.trim() ? o.effective_status.trim().toUpperCase().slice(0, 40) : null
  return { name, status }
}

/** The ad's name and effective_status in Ads Manager, or null (no access, no such ad, Meta slow — 3 s). */
export async function metaAd(adId: string, token: string, fetchImpl: typeof fetch = fetch): Promise<MetaAd | null> {
  if (!AD_ID.test(adId)) return null
  try {
    const res = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSION}/${adId}?fields=name,effective_status`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return null
    const ad = adOf(await res.json())
    return ad.name || ad.status ? ad : null
  } catch {
    return null
  }
}

/** The ad's name in Ads Manager, or null. */
export async function metaAdName(adId: string, token: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  return (await metaAd(adId, token, fetchImpl))?.name ?? null
}

/**
 * Names the ads among `ids` that have no name yet. `db` is the webhook's service-role client, which calls RPCs only
 * (CLAUDE.md › Machine ingest): crm_ads_unnamed and crm_meta_name_ad (mig 20261019100000), the service role's alone;
 * the ad's running status is kept with it (crm_meta_ad_status, mig 20261022120000).
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
      const ad = await metaAd(id, token, fetchImpl)
      if (!ad?.name) { misses.set(id, now + MISS_MS); continue }
      const { data: kept, error: e } = await db.rpc('crm_meta_name_ad', { p_ad: id, p_name: ad.name })
      if (!e && kept === true) named++
      if (ad.status) await db.rpc('crm_meta_ad_status', { p_ad: id, p_name: ad.name, p_status: ad.status })
    }
    return named
  } catch {
    return 0
  }
}

/**
 * Whether each ad is still running (2026-10-22, mig 20261022120000): every ad a customer came from (crm_ads_to_check)
 * is asked of Graph one by one (`?ids=` is refused since Graph v26), at most 100 a run, and its status kept by
 * crm_meta_ad_status — both the service role's alone. The hourly sweep calls it (app/api/member-queue). An ad the token
 * cannot see is skipped (the screens then go by its last lead). Never throws; answers how many statuses were kept.
 */
export async function refreshAdStatuses(db: SupabaseClient, token: string | undefined, fetchImpl: typeof fetch = fetch): Promise<number> {
  if (!token) return 0
  try {
    const { data, error } = await db.rpc('crm_ads_to_check')
    if (error || !Array.isArray(data)) return 0
    const ids = (data as unknown[]).filter((a): a is string => typeof a === 'string' && AD_ID.test(a)).slice(0, 100)
    let kept = 0
    for (const id of ids) {
      const ad = await metaAd(id, token, fetchImpl)
      if (!ad?.status) continue
      const { data: ok, error: e } = await db.rpc('crm_meta_ad_status', { p_ad: id, p_name: ad.name ?? '', p_status: ad.status })
      if (!e && ok === true) kept++
    }
    return kept
  } catch {
    return 0
  }
}

/** For tests: forget the ads Meta would not name. */
export function forgetAdMisses() { misses.clear() }

export interface MetaAdRow { id: string; name: string; status: string; account: string; created: string; start: string | null; end: string | null }

/**
 * Every ad of the ad accounts the system user sees (2026-10-22, the desktop's Ads to teams "+": "director 能提前先把广告加进
 * 来先做分配"; "广告开始跑，或者 pending 要跑（几时开始，几时结束）"): /me/adaccounts, then each account's ads (name,
 * effective_status, created_time, the ad set's start and end; deleted and archived ones
 * left out), running first, newest first, at most 300. The server's — the token never leaves it. Throws when Meta refuses.
 */
export async function listMetaAds(token: string, fetchImpl: typeof fetch = fetch): Promise<MetaAdRow[]> {
  const get = async (path: string) => {
    const res = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Meta answered ${res.status}`);
    return (await res.json()) as { data?: unknown[] };
  };
  const accounts = ((await get('me/adaccounts?fields=id,name&limit=50')).data ?? []) as { id?: unknown; name?: unknown }[];
  const rows: MetaAdRow[] = [];
  for (const acc of accounts) {
    if (typeof acc.id !== 'string' || !/^act_\d+$/.test(acc.id)) continue;
    const filter = encodeURIComponent(JSON.stringify([{ field: 'effective_status', operator: 'NOT_IN', value: ['DELETED', 'ARCHIVED'] }]));
    let ads: unknown[] = [];
    try { ads = (await get(`${acc.id}/ads?fields=id,name,effective_status,created_time,adset{start_time,end_time}&limit=100&filtering=${filter}`)).data ?? []; } catch { continue; }
    for (const a of ads as { id?: unknown; name?: unknown; effective_status?: unknown; created_time?: unknown; adset?: { start_time?: unknown; end_time?: unknown } }[]) {
      if (typeof a.id !== 'string' || !AD_ID.test(a.id)) continue;
      rows.push({ id: a.id, name: typeof a.name === 'string' ? a.name.trim().slice(0, 120) : `Ad ${a.id}`, status: typeof a.effective_status === 'string' ? a.effective_status.toUpperCase() : '',
        account: typeof acc.name === 'string' ? acc.name : acc.id, created: typeof a.created_time === 'string' ? a.created_time : '',
        start: typeof a.adset?.start_time === 'string' ? a.adset.start_time : null, end: typeof a.adset?.end_time === 'string' ? a.adset.end_time : null });
    }
  }
  return rows.sort((x, y) => Number(y.status === 'ACTIVE') - Number(x.status === 'ACTIVE') || y.created.localeCompare(x.created)).slice(0, 300);
}
