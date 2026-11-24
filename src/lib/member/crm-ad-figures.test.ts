import { describe, expect, it } from "vitest";
import { keepSeconds, needsFromParam, readUntil } from "./crm-ad-figures";
import { metaAdsFigures } from "./crm-ad-names-meta";

// 2026-11-24, the owner: "计算还是很慢" — a figure Meta failed to give was kept as null and read "—" for good.
describe("metaAdsFigures: what Meta did not give this time", () => {
  const ok = (spend: number) => ({ code: 200, body: JSON.stringify({ data: [{ spend: String(spend) }] }) });
  const gone = { code: 400, body: JSON.stringify({ error: { code: 100, message: "Unsupported get request." } }) };
  const busy = { code: 400, body: JSON.stringify({ error: { code: 17, message: "User request limit reached" } }) };
  const batchOf = (answer: (url: string, call: number) => object) => {
    let call = 0;
    const f = async (_u: string, init: { body: URLSearchParams }) => {
      call++;
      const reqs = JSON.parse(init.body.get("batch")!) as { relative_url: string }[];
      return new Response(JSON.stringify(reqs.map(r => (r.relative_url.includes("/insights") ? answer(r.relative_url, call) : { code: 200, body: "{}" }))));
    };
    return { f: f as unknown as typeof fetch, calls: () => call };
  };
  const R = [{ key: "r", since: "2026-11-01", until: "2026-11-24" }];

  it("asks a busy ad once more and keeps the answer", async () => {
    const b = batchOf((u, call) => (u.includes("22222") && call === 1 ? busy : ok(u.includes("22222") ? 20 : 10)));
    const got = (await metaAdsFigures(["11111", "22222"], R, "t", b.f)).r;
    expect(got["11111"]?.spend).toBe(10);
    expect(got["22222"]?.spend).toBe(20);
    expect(b.calls()).toBe(2);
  });
  it("leaves out an ad still not given — never null — and keeps null for a deleted one", async () => {
    const b = batchOf(u => (u.includes("22222") ? busy : u.includes("33333") ? gone : ok(10)));
    const got = (await metaAdsFigures(["11111", "22222", "33333"], R, "t", b.f)).r;
    expect(got["11111"]?.spend).toBe(10);
    expect("22222" in got).toBe(false);
    expect(got["33333"]).toBeNull();
  });
});

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
  it("reads a range only up to today, so this month and the fee's month are one read (2026-11-24)", () => {
    expect(readUntil("2026-11-01", "2026-11-30", "2026-11-24")).toBe("2026-11-24");
    expect(readUntil("2026-11-01", "2026-11-24", "2026-11-24")).toBe("2026-11-24");
    expect(readUntil("2026-10-01", "2026-10-31", "2026-11-24")).toBe("2026-10-31");
    expect(readUntil("2026-12-01", "2026-12-31", "2026-11-24")).toBe("2026-12-01");
  });
  it("keeps a finished range an hour, a running one 10 minutes", () => {
    expect(keepSeconds("2026-10-31", "2026-11-23")).toBe(3600);
    expect(keepSeconds("2026-11-23", "2026-11-23")).toBe(600);
    expect(keepSeconds("2026-11-30", "2026-11-23")).toBe(600);
  });
});
