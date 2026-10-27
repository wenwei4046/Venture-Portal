import 'server-only'
import { askAds, type MetaAd } from './ads'

/**
 * Ask Ads Manager about ads with the system user's token (META_SYSTEM_USER_TOKEN — the same the CRM uses; env only,
 * never the browser). It needs the brands' ad accounts and ads_read; Meta answers only for the ads on accounts the
 * system user has (`askAds` asks a refused batch one ad at a time), and says why when it answers for none. Read
 * only: nothing is written at Meta.
 */
export async function fetchMetaAds(ids: string[]): Promise<{ ok: true; ads: MetaAd[]; refused: number } | { ok: false; reason: string }> {
  const token = process.env.META_SYSTEM_USER_TOKEN?.trim()
  if (!token) return { ok: false, reason: 'Meta is not connected yet — the system user token (META_SYSTEM_USER_TOKEN) is not set.' }
  return askAds(ids, async url => {
    let res: Response
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
    } catch {
      return { ok: false, unreachable: true }
    }
    const json = (await res.json().catch(() => null)) as { error?: { code?: number; error_subcode?: number } } | null
    if (!res.ok || json?.error) {
      console.error('[lead-ads] Graph refused', res.status, json?.error?.code, json?.error?.error_subcode)
      return { ok: false, error: json?.error }
    }
    return { ok: true, json }
  })
}
