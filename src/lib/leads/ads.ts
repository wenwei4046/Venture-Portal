// Lead View › an ad's name, where it ran and its link (2026-10-18 — the user: "我要看到廣告名稱，來源，鏈接"). Meta's
// message carries an ad's id and headline only; its name, campaign and ad set come from Ads Manager with the
// system user's ads_read (mig 20261018110000). This file is the shapes, the Graph request and the reading of its
// answer — pure, tested in ads.test.ts; the fetch itself is in ads-server.ts.

import { GRAPH_VERSION } from '@/lib/whatsapp/send'

/** An ad conversations came from, as Settings › Ads lists it (lead_ads()). */
export interface LeadAd {
  adId: string
  /** Meta's headline on the latest conversation ("Chat with us"). */
  headline: string
  brandIds: string[]
  channels: Array<'messenger' | 'instagram'>
  conversations: number
  phones: number
  handed: number
  tests: number
  lastAt: string
  name: string
  campaign: string
  adset: string
  accountId: string
  status: string
  link: string
  /** null = nothing known yet; manual = named by hand; meta = from Ads Manager. */
  source: 'manual' | 'meta' | null
  fetchedAt: string | null
  updatedByName: string
}

/** What Ads Manager says of one ad, as lead_save_meta_ads takes it. */
export interface MetaAd {
  adId: string
  name: string
  campaign: string
  adset: string
  accountId: string
  status: string
  link: string
}

export const AD_FIELDS = 'name,account_id,effective_status,campaign{name},adset{name},creative{effective_object_story_id,instagram_permalink_url}'

/** Graph's batch read: up to 50 ids in one request. */
export function adsRequestUrl(ids: string[]): string {
  return `https://graph.facebook.com/${GRAPH_VERSION}/?ids=${ids.map(encodeURIComponent).join(',')}&fields=${encodeURIComponent(AD_FIELDS)}`
}

/** Ids in batches of 50, digits only, each once. */
export function adBatches(ids: string[]): string[][] {
  const clean = [...new Set(ids.filter(id => /^[0-9]{5,30}$/.test(id)))]
  const out: string[][] = []
  for (let i = 0; i < clean.length; i += 50) out.push(clean.slice(i, i + 50))
  return out
}

type GraphAd = {
  name?: string
  account_id?: string
  effective_status?: string
  campaign?: { name?: string }
  adset?: { name?: string }
  creative?: { effective_object_story_id?: string; instagram_permalink_url?: string }
}

/** The ad's post: its Instagram permalink, else its Facebook post (page_post ids, digits only). */
export function adLinkOf(creative: GraphAd['creative']): string {
  const ig = creative?.instagram_permalink_url
  if (ig && /^https:\/\//.test(ig)) return ig
  const story = creative?.effective_object_story_id
  return story && /^[0-9]+_[0-9]+$/.test(story) ? `https://www.facebook.com/${story}` : ''
}

/** Graph's `?ids=` answer, keyed by ad id, as rows to keep. Ids Meta did not answer for are left out. */
export function parseAds(json: unknown): MetaAd[] {
  if (!json || typeof json !== 'object') return []
  return Object.entries(json as Record<string, GraphAd>)
    .filter(([id, ad]) => /^[0-9]{5,30}$/.test(id) && ad && typeof ad === 'object' && typeof ad.name === 'string')
    .map(([id, ad]) => ({
      adId: id,
      name: (ad.name ?? '').slice(0, 200),
      campaign: (ad.campaign?.name ?? '').slice(0, 200),
      adset: (ad.adset?.name ?? '').slice(0, 200),
      accountId: /^[0-9]{3,30}$/.test(ad.account_id ?? '') ? ad.account_id! : '',
      status: (ad.effective_status ?? '').slice(0, 40),
      link: adLinkOf(ad.creative),
    }))
}

/** Meta's refusal in words: no ads_read (code 100 / 200 / 10 on an ad), an expired token, anything else. */
export function graphRefusal(error: { code?: number; error_subcode?: number; message?: string } | undefined): string {
  if (!error) return 'Meta did not answer — try again.'
  if (error.code === 190) return 'The Meta token has expired — generate a new one for the system user and put it in Vercel.'
  if (error.code === 10 || error.code === 200 || (error.code === 100 && error.error_subcode === 33))
    return 'The Meta token cannot read the ads yet — give the system user the ad accounts and the ads_read permission.'
  return 'Meta refused the request — check the system user and its ad accounts.'
}

type GraphError = { code?: number; error_subcode?: number }
/** One Graph read: its JSON on success, else Meta's error (or none when Meta could not be reached). */
export type AskGraph = (url: string) => Promise<{ ok: true; json: unknown } | { ok: false; error?: GraphError; unreachable?: boolean }>

/** Graph's read of one ad. */
export function adRequestUrl(id: string): string {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(id)}?fields=${encodeURIComponent(AD_FIELDS)}`
}

/**
 * Every ad Meta will show, in batches of 50. Meta refuses a WHOLE `?ids=` batch when one ad in it is on an ad account
 * the system user cannot see (2026-10-27: 8 of 9 ads — 2990s' and Carres' accounts not assigned, partnership ads),
 * so a refused batch is asked again one ad at a time and the ads Meta answers for are kept. An expired token or an
 * unreachable Meta stops at once; a run where Meta answered for none says why.
 */
export async function askAds(ids: string[], ask: AskGraph): Promise<{ ok: true; ads: MetaAd[]; refused: number } | { ok: false; reason: string }> {
  const ads: MetaAd[] = []
  let refused = 0
  let firstError: GraphError | undefined
  for (const batch of adBatches(ids)) {
    const all = await ask(adsRequestUrl(batch))
    if (all.ok) { ads.push(...parseAds(all.json)); continue }
    if (all.unreachable) return { ok: false, reason: 'Meta could not be reached — try again.' }
    if (all.error?.code === 190) return { ok: false, reason: graphRefusal(all.error) }
    for (const id of batch) {
      const one = await ask(adRequestUrl(id))
      if (one.ok) { ads.push(...parseAds({ [id]: one.json })); continue }
      if (one.unreachable) return { ok: false, reason: 'Meta could not be reached — try again.' }
      if (one.error?.code === 190) return { ok: false, reason: graphRefusal(one.error) }
      refused++
      firstError ??= one.error
    }
  }
  if (ads.length === 0 && refused > 0) return { ok: false, reason: graphRefusal(firstError) }
  return { ok: true, ads, refused }
}

/** Ads Manager, opened on this ad. */
export function adsManagerLink(accountId: string, adId: string): string {
  return accountId && adId ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${accountId}&selected_ad_ids=${adId}` : ''
}

/** What the screens call a conversation's ad: the name where there is one, else Meta's headline, else Organic. */
export function adLabel(c: { adName?: string; sourceAd: string; adId?: string | null }): string {
  return c.adName?.trim() || c.sourceAd.trim() || (c.adId ? `Ad ${c.adId}` : '')
}
