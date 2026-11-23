import { describe, expect, it } from "vitest";
import { keepSeconds, needsFromParam } from "./crm-ad-figures";

// GET /member/crm-ad-figures (2026-11-23, the owner: "overview 的数据还是很慢"): the ranges it accepts and how long it keeps them.
describe("crm-ad-figures' ranges", () => {
  it("reads ISO days and Meta ad ids, drops the rest, at most 8 ranges and 40 ads", () => {
    const n = needsFromParam(JSON.stringify([
      { key: "a", since: "2026-11-01", until: "2026-11-23", ids: ["120251332896640103", "x", "12"] },
      { key: "b", since: "nope", until: "2026-11-23", ids: ["52595994164115"] },
      { key: "c", since: "2026-10-01", until: "2026-10-31", ids: [] },
      ...Array.from({ length: 10 }, (_, i) => ({ key: `k${i}`, since: "2026-10-01", until: "2026-10-31", ids: Array.from({ length: 50 }, (_, j) => String(10000 + j)) })),
    ]))!;
    expect(n[0]).toEqual({ key: "a", since: "2026-11-01", until: "2026-11-23", ids: ["120251332896640103"] });
    expect(n.map(x => x.key)).toEqual(["a", "k0", "k1", "k2", "k3", "k4"]);
    expect(n[1].ids.length).toBe(40);
    expect(needsFromParam("not json")).toBeNull();
    expect(needsFromParam(JSON.stringify({ a: 1 }))).toBeNull();
  });
  it("keeps a finished range an hour, a running one 10 minutes", () => {
    expect(keepSeconds("2026-10-31", "2026-11-23")).toBe(3600);
    expect(keepSeconds("2026-11-23", "2026-11-23")).toBe(600);
    expect(keepSeconds("2026-11-30", "2026-11-23")).toBe(600);
  });
});
