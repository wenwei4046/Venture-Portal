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

/** The Page an ad promotes: its creative's page_id, else the Page half of its post id ("<page>_<post>"). */
function pageOfCreative(c: { effective_object_story_id?: unknown; object_story_spec?: { page_id?: unknown } } | undefined): string | null {
  const spec = c?.object_story_spec?.page_id;
  if (typeof spec === 'string' && /^\d+$/.test(spec)) return spec;
  const story = c?.effective_object_story_id;
  const m = typeof story === 'string' ? story.match(/^(\d+)_/) : null;
  return m ? m[1] : null;
}

export interface MetaAdRow { id: string; name: string; status: string; account: string; created: string; start: string | null; end: string | null; page: string | null; pageName: string | null; wa: string | null; messenger: boolean }

/**
 * The WhatsApp numbers the CRM's ads send people to (2026-10-22, the owner: "只有串接到这个 018 358 0219 WA 号码的才是"); a
 * server may name others in CRM_AD_WHATSAPP_NUMBERS (comma-separated, with the country code).
 */
export function crmAdNumbers(env: string | undefined = process.env.CRM_AD_WHATSAPP_NUMBERS): string[] {
  const listed = (env ?? '').split(',').map(n => n.replace(/\D/g, '')).filter(n => n.length >= 8);
  return listed.length ? listed : ['60183580219'];
}

/** The CRM's Pages (META_PAGE_IDS) — their Messenger is the CRM's; any other Page's goes to Lead View. */
export function crmPages(env: string | undefined = process.env.META_PAGE_IDS): string[] {
  return (env ?? '').split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s));
}

/**
 * Every ad of the ad accounts the system user sees (2026-10-22, the desktop's Ads to teams "+": "director 能提前先把广告加进
 * 来先做分配"; "广告开始跑，或者 pending 要跑（几时开始，几时结束）"): /me/adaccounts, then each account's ads (name,
 * effective_status, created_time, the ad set's start and end; deleted and archived ones
 * left out), running first, newest first, at most 300. The server's — the token never leaves it. Throws when Meta refuses.
 */
export async function listMetaAds(token: string, fetchImpl: typeof fetch = fetch, own: { numbers: string[]; pages?: string[] } = { numbers: [] }): Promise<MetaAdRow[]> {
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
    try { ads = (await get(`${acc.id}/ads?fields=id,name,effective_status,created_time,adset{start_time,end_time,destination_type,promoted_object},creative{effective_object_story_id,object_story_spec{page_id}}&limit=100&filtering=${filter}`)).data ?? []; } catch { continue; }
    for (const a of ads as { id?: unknown; name?: unknown; effective_status?: unknown; created_time?: unknown; adset?: { start_time?: unknown; end_time?: unknown; destination_type?: unknown; promoted_object?: { page_id?: unknown; whatsapp_phone_number?: unknown } }; creative?: { effective_object_story_id?: unknown; object_story_spec?: { page_id?: unknown } } }[]) {
      if (typeof a.id !== 'string' || !AD_ID.test(a.id)) continue;
      rows.push({ id: a.id, name: typeof a.name === 'string' ? a.name.trim().slice(0, 120) : `Ad ${a.id}`, status: typeof a.effective_status === 'string' ? a.effective_status.toUpperCase() : '',
        account: typeof acc.name === 'string' ? acc.name : acc.id, created: typeof a.created_time === 'string' ? a.created_time : '',
        start: typeof a.adset?.start_time === 'string' ? a.adset.start_time : null, end: typeof a.adset?.end_time === 'string' ? a.adset.end_time : null,
        page: a.adset?.promoted_object?.page_id && typeof a.adset.promoted_object.page_id === 'string' ? a.adset.promoted_object.page_id : pageOfCreative(a.creative), pageName: null,
        wa: typeof a.adset?.promoted_object?.whatsapp_phone_number === 'string' ? a.adset.promoted_object.whatsapp_phone_number.replace(/\D/g, '') : null,
        messenger: typeof a.adset?.destination_type === 'string' && a.adset.destination_type.toUpperCase().includes('MESSENGER') });
    }
  }
  // Only the ads that reach this CRM (2026-10-22, the owner: "这里的广告应该只有 dc & the conts 的不是吗？", then of Dream
  // Crafter ads sent to other WhatsApp numbers: "应该不是 DC & the conts 的广告", and "只有串接到这个 018 358 0219 WA 号码的才
  // 是"): an ad whose ad set sends people to one of the CRM's ad numbers (`own.numbers`, digits with the country code).
  // And (2026-10-27, the owner: "要") an ad whose ad set sends people to Messenger on one of the CRM's Pages (`own.pages`,
  // META_PAGE_IDS) — a Click-to-Messenger ad of The Conts, set up on Assignment before its first lead.
  // No numbers given = every ad.
  const numbers = new Set(own.numbers.map(n => n.replace(/\D/g, '')).filter(Boolean));
  const pages = new Set((own.pages ?? []).map(p => p.trim()).filter(Boolean));
  const kept = rows.filter(r => !numbers.size || (r.wa !== null && numbers.has(r.wa)) || (r.messenger && r.page !== null && pages.has(r.page)));
  // Each Page's name, once (the desktop groups the ads by it: The Conts, Dream Crafter).
  const names = new Map<string, string | null>();
  for (const pg of new Set(kept.map(r => r.page).filter((x): x is string => !!x))) {
    try { const n = (await get(`${pg}?fields=name`)) as { name?: unknown }; names.set(pg, typeof n.name === 'string' ? n.name.slice(0, 120) : null); } catch { names.set(pg, null); }
  }
  kept.forEach(r => { r.pageName = r.page ? names.get(r.page) ?? null : null; });
  return kept.sort((x, y) => Number(y.status === 'ACTIVE') - Number(x.status === 'ACTIVE') || y.created.localeCompare(x.created)).slice(0, 300);
}

/** An ad's figures from Ads Manager for a range (2026-10-22, Ads Performance: "做花费和每个名单成本"). */
export interface MetaFig { spend: number; impr: number; reach: number; clicks: number; allClicks: number; msgconv: number; budget?: MetaBudget | null }

/**
 * An ad's budget as set in Ads Manager today (2026-10-27, the owner: "让系统读取每支广告的日预算"): its ad set's daily or
 * lifetime budget, else its campaign's (Advantage campaign budget — one budget shared by every ad set under it). In
 * ringgit (Graph answers the account currency's smallest unit). `key` is whoever holds it ("adset:…" / "campaign:…"),
 * so a total counts a shared budget once.
 */
export interface MetaBudget { daily: number | null; lifetime: number | null; key: string; level: 'adset' | 'campaign' }

export async function metaAdBudget(adId: string, token: string, fetchImpl: typeof fetch = fetch): Promise<MetaBudget | null> {
  if (!AD_ID.test(adId)) return null
  try {
    const fields = encodeURIComponent('adset{id,daily_budget,lifetime_budget},campaign{id,daily_budget,lifetime_budget}')
    const res = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSION}/${adId}?fields=${fields}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    type Holder = { id?: unknown; daily_budget?: unknown; lifetime_budget?: unknown }
    const body = (await res.json()) as { adset?: Holder; campaign?: Holder }
    const rm = (v: unknown) => { const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN; return Number.isFinite(n) && n > 0 ? n / 100 : null }
    for (const [level, h] of [['adset', body.adset], ['campaign', body.campaign]] as const) {
      const daily = rm(h?.daily_budget), lifetime = rm(h?.lifetime_budget)
      if ((daily || lifetime) && typeof h?.id === 'string') return { daily, lifetime, key: `${level}:${h.id}`, level }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Meta's insights for one ad over [since, until] (YYYY-MM-DD, the ad account's days): spend, impressions, reach, link
 * clicks, all clicks and messaging conversations started. An ad with no delivery in the range answers zeros; one the
 * token cannot see answers null (Ads Performance shows "—"). The server's only (the token never leaves it).
 */
export async function metaAdInsights(adId: string, token: string, since: string, until: string, fetchImpl: typeof fetch = fetch): Promise<MetaFig | null> {
  if (!AD_ID.test(adId) || !/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) return null;
  try {
    const range = encodeURIComponent(JSON.stringify({ since, until }));
    const res = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSION}/${adId}/insights?fields=spend,impressions,reach,inline_link_clicks,clicks,actions&time_range=${range}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    return figOf((((await res.json()) as { data?: Record<string, unknown>[] }).data ?? [])[0] ?? {});
  } catch {
    return null;
  }
}

/** One insights row as our figures (messaging conversations started = Meta's 7-day attribution, as Ads Manager shows). */
function figOf(row: Record<string, unknown>): MetaFig {
  const num = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? Number(v) || 0 : 0);
  const actions = Array.isArray(row.actions) ? (row.actions as { action_type?: unknown; value?: unknown }[]) : [];
  const msg = actions.find(a => a.action_type === 'onsite_conversion.messaging_conversation_started_7d');
  return { spend: num(row.spend), impr: num(row.impressions), reach: num(row.reach), clicks: num(row.inline_link_clicks), allClicks: num(row.clicks), msgconv: num(msg?.value) };
}

/**
 * An ad's figures DAY BY DAY over a range (2026-10-23, Ads Performance's chart — the owner: "加一个数据图（参考谷歌广告的成效
 * 显示）"): Graph's insights with time_increment=1, keyed by the day ("2026-10-21"); a day with no delivery has no row.
 * Null when the ad cannot be read (the token cannot see it, a timeout).
 */
export async function metaAdDaily(adId: string, token: string, since: string, until: string, fetchImpl: typeof fetch = fetch): Promise<Record<string, MetaFig> | null> {
  if (!AD_ID.test(adId) || !/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) return null;
  try {
    const range = encodeURIComponent(JSON.stringify({ since, until }));
    const res = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSION}/${adId}/insights?fields=spend,impressions,reach,inline_link_clicks,clicks,actions&time_increment=1&limit=500&time_range=${range}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const out: Record<string, MetaFig> = {};
    for (const row of ((await res.json()) as { data?: Record<string, unknown>[] }).data ?? []) {
      if (typeof row.date_start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date_start)) out[row.date_start] = figOf(row);
    }
    return out;
  } catch {
    return null;
  }
}

/** Meta's own image hosts only — an ad's picture is drawn straight from them. */
const metaImage = (u: unknown): string | null =>
  typeof u === 'string' && /^https:\/\/[A-Za-z0-9.-]+\.(fbcdn\.net|fbsbx\.com|facebook\.com)\//.test(u) ? u : null

/**
 * Each ad's picture (Workspace's report, 2026-10-27: "每个广告的截图"): its creative's image, else the thumbnail Meta draws
 * of it (a video's first frame). Asked ad by ad, four at a time (Graph v26 refuses `?ids=`), up to 40; an ad the token
 * cannot see is left out. Full size (2026-10-27, the owner: "截图改成大图"): Meta's thumbnail is 64 px unless asked for a
 * size, so it is asked at 800 px, and a video's own cover or a link ad's picture — both full size — come before it.
 */
export async function metaAdThumbs(adIds: string[], token: string, fetchImpl: typeof fetch = fetch): Promise<Record<string, string>> {
  const ids = [...new Set(adIds)].filter(id => AD_ID.test(id)).slice(0, 40)
  const out: Record<string, string> = {}
  const one = async (id: string) => {
    try {
      const fields = encodeURIComponent('creative.thumbnail_width(800).thumbnail_height(800){image_url,thumbnail_url,object_story_spec{video_data{image_url},link_data{picture}}}')
      const res = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSION}/${id}?fields=${fields}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) return
      const c = ((await res.json()) as { creative?: { image_url?: unknown; thumbnail_url?: unknown; object_story_spec?: { video_data?: { image_url?: unknown }; link_data?: { picture?: unknown } } } }).creative
      const u = metaImage(c?.image_url) ?? metaImage(c?.object_story_spec?.video_data?.image_url) ?? metaImage(c?.object_story_spec?.link_data?.picture) ?? metaImage(c?.thumbnail_url)
      if (u) out[id] = u
    } catch { /* left out */ }
  }
  for (let i = 0; i < ids.length; i += 4) await Promise.all(ids.slice(i, i + 4).map(one))
  return out
}
