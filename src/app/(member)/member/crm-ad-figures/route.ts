/**
 * Ads Manager's figures for the desktop CRM (2026-11-23, the owner: "overview 的数据还是很慢"). Read-only, so a GET: a
 * Server Action waits behind the screen's other actions (the CRM re-reads every 5 s, one action at a time), a GET does not.
 * Same gate as fetchAdInsightsMany — CRM · Manage, or View at All — and the same token, which never leaves the server.
 * Meta's answers are kept on the server (ad-figures-cache.ts) for whoever asks next: a range that ended before today for an
 * hour, one still running for 10 minutes — the gate is asked on every request before the cache is read.
 *
 *   GET /member/crm-ad-figures?n=<JSON [{ key, since, until, ids }]>  →  { figs: { [key]: { [adId]: MetaFig | null } } }
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cacheKey, cachedFigs, keepFigs, once } from "@/lib/member/ad-figures-cache";
import { getAccountUser, getMemberUser } from "@/lib/auth";
import { canDo } from "@/lib/permission-actions";
import { metaAdsFigures, type MetaFig } from "@/lib/member/crm-ad-names-meta";
import { officeToday } from "@/lib/office-time";
import { keepSeconds, needsFromParam, readUntil, type AdFigNeed as Need } from "@/lib/member/crm-ad-figures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" } });


/**
 * One range's figures, kept for the next asker (the key is the range and its ads, never the person). The days after
 * today have no spend, so a range is read up to today (2026-11-24: "This month" 1–30 Nov and the fee's 1–24 Nov were two
 * reads of Meta for one answer). An answer missing an ad (Meta did not give it this time) is not kept — the next ask
 * reads Meta again — and the ad is left out, so the screen asks again rather than keeping "—".
 */
async function rangeFigs(n: Need, token: string, today: string): Promise<{ figs: Record<string, MetaFig | null>; stale: boolean }> {
  const ids = [...new Set(n.ids)].sort(), until = readUntil(n.since, n.until, today);
  // Kept in the Worker's memory and Cloudflare's cache (ad-figures-cache.ts) — Next's unstable_cache kept nothing on
  // Cloudflare, so every open asked Meta (2026-11-26).
  const key = cacheKey(n.since, until, ids);
  const read = () => once(key, async () => {
    const got = (await metaAdsFigures(ids, [{ key: "r", since: n.since, until }], token)).r ?? {};
    if (!ids.some(id => !(id in got))) await keepFigs(key, got, keepSeconds(until, today));
    return got;
  });
  const kept = await cachedFigs(key);
  if (kept && !kept.stale) return { figs: kept.figs, stale: false };
  // Old first, then new (the owner: "先看到之前的记录再跳真正的数据"): a stale answer goes at once and Meta is read behind it,
  // the Worker kept alive for it (waitUntil); the screen asks again a few seconds later for the new one.
  if (kept) { behind(read().catch(() => undefined)); return { figs: kept.figs, stale: true }; }
  return { figs: await read(), stale: false };
}

/** Keeps the Worker running for work after the answer has gone (Cloudflare's waitUntil); in Node the promise just runs. */
function behind(p: Promise<unknown>) {
  try { getCloudflareContext().ctx.waitUntil(p); } catch { /* not on Cloudflare */ }
}

export async function GET(request: Request) {
  const user = await getMemberUser();
  if (!user?.is_active) return json(401, { error: "Sign in first." });
  const account = await getAccountUser();
  if (!account?.is_active || !(canDo(account, "crm", "manage") || canDo(account, "crm", "view", "all"))) return json(403, { error: "You may not do that." });
  const token = process.env.META_SYSTEM_USER_TOKEN?.trim();
  if (!token) return json(503, { error: "Meta is not connected on this server." });
  const needs = needsFromParam(new URL(request.url).searchParams.get("n"));
  if (!needs) return json(400, { error: "Those ranges could not be read." });
  const today = officeToday();
  try {
    const got = await Promise.all(needs.map(n => rangeFigs(n, token, today)));
    // An ad Meta did not answer for this time is left out (the screen asks again); null = it never will. `stale` names the
    // ranges answered from an older read while a new one is made — the screen asks for them again shortly.
    return json(200, {
      figs: Object.fromEntries(needs.map((n, i) => [n.key, Object.fromEntries(n.ids.filter(id => id in got[i].figs).map(id => [id, got[i].figs[id]]))])),
      stale: needs.filter((_, i) => got[i].stale).map(n => n.key),
    });
  } catch {
    return json(502, { error: "Meta's figures could not be read." });
  }
}
