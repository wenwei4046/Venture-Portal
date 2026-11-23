import { describe, expect, it, vi } from "vitest";
import { adFigureParts, readAdFigures } from "./ad-figures-read";

// The phone's Overview and Ads performance read through the GET (2026-11-23, the owner: "手机很慢，尤其 total cost & per lead").
const ids = (n: number, from = 10000) => Array.from({ length: n }, (_, i) => String(from + i));

describe("reading Ads Manager's figures through the GET", () => {
  it("cuts a range into 40 ads a piece and 8 pieces a request", () => {
    const parts = adFigureParts([{ key: "a", since: "2026-11-01", until: "2026-11-23", ids: [...ids(90), "ch:x"] }, ...Array.from({ length: 7 }, (_, i) => ({ key: `m${i}`, since: "2026-10-01", until: "2026-10-31", ids: ids(3) }))]);
    expect(parts.map(p => p.length)).toEqual([8, 2]);
    expect(parts[0].slice(0, 3).map(p => [p.key, p.part[0].key, p.part[0].ids.length])).toEqual([["a", "a#0", 40], ["a", "a#1", 40], ["a", "a#2", 10]]);
  });

  it("puts the pieces back under their range, and leaves out a request that failed", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const n = JSON.parse(decodeURIComponent(url.split("?n=")[1])) as { key: string; ids: string[] }[];
      if (n.some(x => x.key.startsWith("bad"))) return new Response("{}", { status: 502 });
      return new Response(JSON.stringify({ figs: Object.fromEntries(n.map(x => [x.key, Object.fromEntries(x.ids.map(id => [id, { spend: 1 }]))])) }));
    });
    const heard = vi.fn();
    const got = await readAdFigures([{ key: "a", since: "2026-11-01", until: "2026-11-23", ids: ids(45) }], heard, fetchImpl as unknown as typeof fetch);
    expect(Object.keys(got.a)).toHaveLength(45);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(heard).toHaveBeenCalledTimes(1);
    const bad = await readAdFigures([{ key: "bad", since: "2026-11-01", until: "2026-11-23", ids: ids(2) }], undefined, fetchImpl as unknown as typeof fetch);
    expect(bad).toEqual({});
  });
});
