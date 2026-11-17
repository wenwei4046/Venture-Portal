import 'server-only'
import { GRAPH_VERSION } from '@/lib/whatsapp/send'
import { isBranding } from './overview'

/**
 * Lead View › Overview's ad spend (2026-11-17): the ad accounts the system user can read and each one's spend per day,
 * Lead funnel / Branding by the campaign's objective, from Meta's insights with `META_SYSTEM_USER_TOKEN`. Never throws:
 * what Meta refuses comes back as words. The token never leaves the server.
 */

export interface MetaAccount { accountId: string; name: string }
export interface SpendDay { accountId: string; day: string; funnel: number; branding: number }
export type SpendRead = { ok: true; accounts: MetaAccount[]; rows: SpendDay[]; refused: string[] } | { ok: false; reason: string }

type Page<T> = { data?: T[]; paging?: { next?: string }; error?: { message?: string; code?: number } }

async function pages<T>(url: string, token: string, fetchImpl: typeof fetch, max = 20): Promise<{ ok: true; rows: T[] } | { ok: false; reason: string }> {
  const rows: T[] = []
  let next: string | undefined = url
  for (let i = 0; next && i < max; i++) {
    let body: Page<T>
    try {
      const res = await fetchImpl(next, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) })
      body = (await res.json()) as Page<T>
    } catch {
      return { ok: false, reason: 'Meta did not answer.' }
    }
    if (body.error) {
      const busy = body.error.code === 80004 || body.error.code === 17 || body.error.code === 4
      return { ok: false, reason: busy ? 'Meta says it is busy — try again in a few minutes.' : body.error.message || 'Meta refused the request.' }
    }
    rows.push(...(body.data ?? []))
    next = body.paging?.next
  }
  return { ok: true, rows }
}

/** Every day of [from, to] (YYYY-MM-DD). */
function days(from: string, to: string): string[] {
  const out: string[] = []
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`) && out.length < 400; t += 864e5) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}

/** The accounts and their days in [from, to]; a day Meta has no row for reads 0, so the cache knows it was asked. */
export async function readAdSpend(from: string, to: string, token: string | undefined, fetchImpl: typeof fetch = fetch): Promise<SpendRead> {
  if (!token) return { ok: false, reason: 'Meta is not connected on this server (no system user token).' }
  const base = `https://graph.facebook.com/${GRAPH_VERSION}`
  const listed = await pages<{ account_id?: string; name?: string }>(`${base}/me/adaccounts?fields=name,account_id&limit=200`, token, fetchImpl)
  if (!listed.ok) return listed
  const accounts = listed.rows.filter(a => typeof a.account_id === 'string' && /^\d{1,24}$/.test(a.account_id))
    .map(a => ({ accountId: a.account_id as string, name: String(a.name ?? '') }))
  const range = encodeURIComponent(JSON.stringify({ since: from, until: to }))
  const rows: SpendDay[] = []
  const refused: string[] = []
  for (const a of accounts) {
    const got = await pages<{ objective?: string; spend?: string; date_start?: string }>(
      `${base}/act_${a.accountId}/insights?level=campaign&fields=objective,spend&time_increment=1&limit=500&time_range=${range}`, token, fetchImpl)
    if (!got.ok) { refused.push(`${a.name || a.accountId}: ${got.reason}`); continue }
    const byDay = new Map(days(from, to).map(d => [d, { funnel: 0, branding: 0 }]))
    for (const r of got.rows) {
      const d = byDay.get(String(r.date_start ?? ''))
      const n = Number(r.spend)
      if (!d || !Number.isFinite(n) || n <= 0) continue
      if (isBranding(r.objective)) d.branding += n
      else d.funnel += n
    }
    for (const [day, v] of byDay) rows.push({ accountId: a.accountId, day, funnel: Math.round(v.funnel * 100) / 100, branding: Math.round(v.branding * 100) / 100 })
  }
  return { ok: true, accounts, rows, refused }
}
