import { describe, expect, it } from "vitest";
import { metaAdIds, prefetchNeeds } from "./prefetch";

// 2026-11-26 (the owner: "insight 的算法速度还是有点慢，尤其我从进页面，换时间等"): the other periods are read ahead.
describe("reading Insight's other periods ahead", () => {
  const now = new Date(2026, 10, 26, 10); // Thu 26 Nov 2026
  it("asks only real ad ids, the customers' and the added ones", () => {
    expect(metaAdIds([{ adId: "52625304217664" }, { adId: null }, { adId: "ch:whatsapp" }], { "120254844932380368": {}, x: {} }))
      .toEqual(["120254844932380368", "52625304217664"]);
  });
  it("covers today, this week, this month, the period before each and their fee months, each once", () => {
    const keys = prefetchNeeds(now, ["111111"]).flat().map(n => n.key);
    expect(keys).toContain("2026-11-26|2026-11-26"); // today
    expect(keys).toContain("2026-11-25|2026-11-25"); // yesterday
    expect(keys).toContain("2026-11-23|2026-11-29"); // this week
    expect(keys).toContain("2026-11-16|2026-11-22"); // last week
    expect(keys).toContain("2026-11-01|2026-11-30"); // this month
    expect(keys).toContain("2026-10-01|2026-10-31"); // last month
    expect(keys).toContain("2026-11-01|2026-11-26"); // the fee's month, up to today
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("leaves out what the screen already has, and keeps to 8 ranges and 40 ads a request", () => {
    const ids = Array.from({ length: 45 }, (_, i) => String(100000 + i));
    const parts = prefetchNeeds(now, ids, { "2026-11-01|2026-11-30": Object.fromEntries(ids.map(id => [id, null])) });
    expect(parts.flat().some(n => n.key === "2026-11-01|2026-11-30")).toBe(false);
    for (const p of parts) { expect(p.length).toBeLessThanOrEqual(8); for (const n of p) expect(n.ids.length).toBeLessThanOrEqual(40); }
  });
  it("asks nothing with no ads", () => {
    expect(prefetchNeeds(now, [])).toEqual([]);
  });
});
