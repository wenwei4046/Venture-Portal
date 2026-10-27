// Lead View › which ad account an ad belongs to (2026-10-27, the user: "改成按广告所属的广告账户分：账户名有 Mini 的就是
// 2990s mini"). Meta's click carries the ad's id and its headline only; every 2990s mini ad runs on the 2990s Page from an
// ad account named "2990's Mini@…" with headlines like "Chat with us", so the account's name is what tells them apart.
// Asked of Graph with the system user's token (ads_read), 3 s each, best effort: an answer or null, never a throw.
// Kept per server instance — an account's name rarely changes; a failure is asked again after 10 minutes.

import { GRAPH_VERSION } from '@/lib/whatsapp/send'

const known = new Map<string, { name: string | null; at: number }>()
const RETRY_MS = 10 * 60 * 1000

/** The name of the ad account the ad runs from, or null when Meta does not say. */
export async function adAccountName(adId: string, token: string | undefined, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<string | null> {
  if (!token || !/^[0-9]{5,30}$/.test(adId)) return null
  const kept = known.get(adId)
  if (kept && (kept.name !== null || now - kept.at < RETRY_MS)) return kept.name
  const ask = async (path: string) => {
    const res = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000),
    })
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null
  }
  let name: string | null = null
  try {
    const ad = await ask(`${adId}?fields=account_id`)
    const account = typeof ad?.account_id === 'string' && /^[0-9]{3,30}$/.test(ad.account_id) ? ad.account_id : null
    const acc = account ? await ask(`act_${account}?fields=name`) : null
    name = typeof acc?.name === 'string' && acc.name.trim() ? acc.name.trim().slice(0, 120) : null
  } catch {
    name = null
  }
  known.set(adId, { name, at: now })
  return name
}

/** For tests: forget what was asked. */
export function forgetAdAccounts(): void {
  known.clear()
}
