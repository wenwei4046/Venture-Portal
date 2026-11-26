/**
 * CORRECTION (the same day): production runs on VERCEL, where Next's data cache works; the route keeps unstable_cache as the
 * layer shared by every server, and this file is the per-server memory (fresh / stale, a week) in front of it.
 *
 * Where GET /member/crm-ad-figures keeps Meta's answers (2026-11-26, the owner: "insight 的算法速度还是有点慢，尤其我从进页面，换
 * 时间等"). The route kept them in Next's `unstable_cache`, but on Cloudflare (open-next) that needs an incremental cache the
 * app never set up (`defineCloudflareConfig({})` — the "dummy" cache), so nothing was kept and EVERY open and every period
 * change waited for Meta's Graph API. Two layers that need no setup:
 *   1. this Worker's own memory (a Map, gone when the isolate is) — instant for whoever asks next on the same isolate;
 *   2. Cloudflare's Cache API (`caches.default`, the data centre's, shared by every isolate there) — absent in Node dev.
 * The key is the range and its ads, never the person (the route asks the gate before reading either).
 *
 * Old first, then new (the same day, the owner: "还是很慢 有没有可能先看到之前的记录再跳真正的数据"): an answer is FRESH for
 * `keepSeconds` (an hour for a range that ended, 10 minutes for one still running) and KEPT for a week. A fresh one is the
 * answer; a stale one is answered at once, marked stale, while the route reads Meta again behind it — the screen asks once
 * more a few seconds later and gets the new figures. An answer Meta left ads out of is not kept.
 */
import type { MetaFig } from "./crm-ad-names-meta";

export type Figs = Record<string, MetaFig | null>;
type Entry = { figs: Figs; fresh: number; until: number };

const mem = new Map<string, Entry>();
const MAX = 400;
/** How long an answer is kept to be shown while a new one is read. */
export const KEEP_SECONDS = 7 * 86_400;

/** The edge cache, when the runtime has one (Cloudflare Workers); none in Node. */
export type EdgeCache = { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> };
function edge(): EdgeCache | null {
  const c = (globalThis as { caches?: { default?: EdgeCache } }).caches;
  return c?.default ?? null;
}
const keyUrl = (key: string) => new Request(`https://crm-ad-figures.cache/v4/${encodeURIComponent(key)}`);

export const cacheKey = (since: string, until: string, ids: string[]) => `${since}|${until}|${[...new Set(ids)].sort().join(",")}`;

/** What is kept for the key — `stale` once past its fresh time — else null. */
export async function cachedFigs(key: string, now = Date.now(), cache: EdgeCache | null = edge()): Promise<{ figs: Figs; stale: boolean } | null> {
  let e = mem.get(key);
  if (e && e.until <= now) { mem.delete(key); e = undefined; }
  if (!e && cache) {
    try {
      const res = await cache.match(keyUrl(key));
      const body = res ? ((await res.json()) as Entry) : null;
      if (body?.figs && body.until > now) { e = body; mem.set(key, body); }
    } catch { /* read as nothing kept */ }
  }
  return e ? { figs: e.figs, stale: e.fresh <= now } : null;
}

/** Keeps a whole answer: fresh for `seconds`, kept a week. */
export async function keepFigs(key: string, figs: Figs, seconds: number, now = Date.now(), cache: EdgeCache | null = edge()): Promise<void> {
  const entry: Entry = { figs, fresh: now + seconds * 1000, until: now + KEEP_SECONDS * 1000 };
  if (!mem.has(key) && mem.size >= MAX) mem.delete(mem.keys().next().value as string);
  mem.set(key, entry);
  if (!cache) return;
  try {
    await cache.put(keyUrl(key), new Response(JSON.stringify(entry), { headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${KEEP_SECONDS}` } }));
  } catch { /* the memory copy stands */ }
}

/** One read of Meta at a time for a key, however many ask while it runs. */
const reading = new Map<string, Promise<unknown>>();
export function once<T>(key: string, read: () => Promise<T>): Promise<T> {
  const was = reading.get(key);
  if (was) return was as Promise<T>;
  const p = read().finally(() => reading.delete(key));
  reading.set(key, p);
  return p;
}

/** Tests only. */
export const forgetFigs = () => { mem.clear(); reading.clear(); };
