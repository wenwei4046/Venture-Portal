/**
 * Where GET /member/crm-ad-figures keeps Meta's answers (2026-11-26, the owner: "insight 的算法速度还是有点慢，尤其我从进页面，换
 * 时间等"). The route kept them in Next's `unstable_cache`, but on Cloudflare (open-next) that needs an incremental cache the
 * app never set up (`defineCloudflareConfig({})` — the "dummy" cache), so nothing was kept and EVERY open and every period
 * change waited for Meta's Graph API. Now two layers that need no setup:
 *   1. this Worker's own memory (a Map, gone when the isolate is) — instant for whoever asks next on the same isolate;
 *   2. Cloudflare's Cache API (`caches.default`, the data centre's, shared by every isolate there) — absent in Node dev.
 * The key is the range and its ads, never the person (the route asks the gate before reading either). A range that ended
 * before today is kept an hour, one still running 10 minutes (`keepSeconds`); an answer Meta left ads out of is not kept.
 */
import type { MetaFig } from "./crm-ad-names-meta";

export type Figs = Record<string, MetaFig | null>;
type Entry = { figs: Figs; until: number };

const mem = new Map<string, Entry>();
const MAX = 400;

/** The edge cache, when the runtime has one (Cloudflare Workers); none in Node. */
type EdgeCache = { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> };
function edge(): EdgeCache | null {
  const c = (globalThis as { caches?: { default?: EdgeCache } }).caches;
  return c?.default ?? null;
}
const keyUrl = (key: string) => new Request(`https://crm-ad-figures.cache/v3/${encodeURIComponent(key)}`);

export const cacheKey = (since: string, until: string, ids: string[]) => `${since}|${until}|${[...new Set(ids)].sort().join(",")}`;

/** What is kept for the key and still fresh, else null. */
export async function cachedFigs(key: string, now = Date.now(), cache: EdgeCache | null = edge()): Promise<Figs | null> {
  const m = mem.get(key);
  if (m && m.until > now) return m.figs;
  if (m) mem.delete(key);
  if (!cache) return null;
  try {
    const res = await cache.match(keyUrl(key));
    if (!res) return null;
    const body = (await res.json()) as Entry;
    if (!body?.figs || body.until <= now) return null;
    mem.set(key, body);
    return body.figs;
  } catch { return null; }
}

/** Keeps a whole answer for `seconds`. */
export async function keepFigs(key: string, figs: Figs, seconds: number, now = Date.now(), cache: EdgeCache | null = edge()): Promise<void> {
  const entry: Entry = { figs, until: now + seconds * 1000 };
  if (mem.size >= MAX) mem.delete(mem.keys().next().value as string);
  mem.set(key, entry);
  if (!cache) return;
  try {
    await cache.put(keyUrl(key), new Response(JSON.stringify(entry), { headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${seconds}` } }));
  } catch { /* the memory copy stands */ }
}

/** Tests only. */
export const forgetFigs = () => mem.clear();
