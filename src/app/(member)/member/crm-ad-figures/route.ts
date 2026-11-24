/**
 * Ads Manager's figures for the desktop CRM (2026-11-23, the owner: "overview 的数据还是很慢"). Read-only, so a GET: a
 * Server Action waits behind the screen's other actions (the CRM re-reads every 5 s, one action at a time), a GET does not.
 * Same gate as fetchAdInsightsMany — CRM · Manage, or View at All — and the same token, which never leaves the server.
 * Meta's answers are kept on the server (Next's data cache) for whoever asks next: a range that ended before today for an
 * hour, one still running for 10 minutes — the gate is asked on every request before the cache is read.
 *
 *   GET /member/crm-ad-figures?n=<JSON [{ key, since, until, ids }]>  →  { figs: { [key]: { [adId]: MetaFig | null } } }
 */
import { unstable_cache } from "next/cache";
import { getAccountUser, getMemberUser } from "@/lib/auth";
import { canDo } from "@/lib/permission-actions";
import { metaAdsFigures, type MetaFig } from "@/lib/member/crm-ad-names-meta";
import { officeToday } from "@/lib/office-time";
import { keepSeconds, needsFromParam, readUntil, type AdFigNeed as Need } from "@/lib/member/crm-ad-figures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store" } });

/** An answer Meta left ads out of (rangeFigs): thrown so Next keeps nothing, carrying what did come. */
class Partial extends Error { constructor(readonly figs: Record<string, MetaFig | null>) { super("partial"); } }

/**
 * One range's figures, kept by Next for the next asker (the key is the range and its ads, never the person). The days after
 * today have no spend, so a range is read up to today (2026-11-24: "This month" 1–30 Nov and the fee's 1–24 Nov were two
 * reads of Meta for one answer). An answer missing an ad (Meta did not give it this time) is not kept — the next ask
 * reads Meta again — and the ad is left out, so the screen asks again rather than keeping "—".
 */
async function rangeFigs(n: Need, token: string, today: string): Promise<Record<string, MetaFig | null>> {
  const ids = [...new Set(n.ids)].sort(), until = readUntil(n.since, n.until, today);
  const read = unstable_cache(async () => {
    const got = (await metaAdsFigures(ids, [{ key: "r", since: n.since, until }], token)).r ?? {};
    if (ids.some(id => !(id in got))) throw new Partial(got);
    return got;
  }, ["crm-ad-figures-v2", n.since, until, ids.join(",")], { revalidate: keepSeconds(until, today) });
  try { return await read(); } catch (e) { if (e instanceof Partial) return e.figs; throw e; }
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
    // An ad Meta did not answer for this time is left out (the screen asks again); null = it never will.
    return json(200, { figs: Object.fromEntries(needs.map((n, i) => [n.key, Object.fromEntries(n.ids.filter(id => id in got[i]).map(id => [id, got[i][id]]))])) });
  } catch {
    return json(502, { error: "Meta's figures could not be read." });
  }
}
