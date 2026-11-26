import { beforeEach, describe, expect, it } from "vitest";
import { cacheKey, cachedFigs, forgetFigs, keepFigs } from "./ad-figures-cache";

// 2026-11-26: Next's unstable_cache kept nothing on Cloudflare, so every Insight open asked Meta.
const fig = (spend: number) => ({ spend, impr: 0, reach: 0, clicks: 0, allClicks: 0, msgconv: 0 });

function fakeEdge() {
  const store = new Map<string, string>();
  return {
    store,
    async match(req: Request) { const v = store.get(req.url); return v == null ? undefined : new Response(v); },
    async put(req: Request, res: Response) { store.set(req.url, await res.text()); },
  };
}

describe("the server's keeping of Meta's figures", () => {
  beforeEach(() => forgetFigs());
  it("keys a range by its days and its ads, in any order", () => {
    expect(cacheKey("2026-11-01", "2026-11-26", ["2", "1", "2"])).toBe(cacheKey("2026-11-01", "2026-11-26", ["1", "2"]));
  });
  it("answers what it kept until it goes stale", async () => {
    const edge = fakeEdge(), t = 1_000_000;
    await keepFigs("k", { a: fig(5) }, 600, t, edge);
    expect(await cachedFigs("k", t + 599_000, edge)).toEqual({ a: fig(5) });
    expect(await cachedFigs("k", t + 601_000, edge)).toBeNull();
  });
  it("finds in the edge cache what another isolate kept", async () => {
    const edge = fakeEdge(), t = 1_000_000;
    await keepFigs("k", { a: fig(7) }, 3600, t, edge);
    forgetFigs(); // a fresh isolate: its memory is empty
    expect(await cachedFigs("k", t + 1000, edge)).toEqual({ a: fig(7) });
  });
  it("works with no edge cache (Node)", async () => {
    await keepFigs("k", { a: fig(1) }, 600, 0, null);
    expect(await cachedFigs("k", 1000, null)).toEqual({ a: fig(1) });
    expect(await cachedFigs("other", 1000, null)).toBeNull();
  });
});
