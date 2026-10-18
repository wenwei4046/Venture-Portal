import 'server-only'
import { adBatches, adsRequestUrl, graphRefusal, parseAds, type MetaAd } from './ads'

/**
 * Ask Ads Manager about ads with the system user's token (META_SYSTEM_USER_TOKEN — the same the CRM uses; env only,
 * never the browser). It needs the brands' ad accounts and ads_read; without them Meta refuses, and so does this,
 * in words. Read only: nothing is written at Meta.
 */
export async function fetchMetaAds(ids: string[]): Promise<{ ok: true; ads: MetaAd[] } | { ok: false; reason: string }> {
  const token = process.env.META_SYSTEM_USER_TOKEN?.trim()
  if (!token) return { ok: false, reason: 'Meta is not connected yet — the system user token (META_SYSTEM_USER_TOKEN) is not set.' }
  const ads: MetaAd[] = []
  for (const batch of adBatches(ids)) {
    let res: Response
    try {
      res = await fetch(adsRequestUrl(batch), { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
    } catch {
      return { ok: false, reason: 'Meta could not be reached — try again.' }
    }
    const json = (await res.json().catch(() => null)) as { error?: { code?: number; error_subcode?: number } } | null
    if (!res.ok || json?.error) {
      console.error('[lead-ads] Graph refused', res.status, json?.error?.code, json?.error?.error_subcode)
      return { ok: false, reason: graphRefusal(json?.error) }
    }
    ads.push(...parseAds(json))
  }
  return { ok: true, ads }
}
