import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { brandsOn, brandTicksFromJson, isBrandTickList, sameBrandTicks, sortedBrandTicks, toggleBrand } from "./crm-brand-ticks";
import { brandOf } from "./member/crm-source";

// The owner, 2026-11-17: "只有 dc 权限的人可以看到 dc 的客户资讯，ads performance 等" — "按人打勾".
describe("a person's CRM brands", () => {
  it("are every brand until one is taken off", () => {
    expect([...brandsOn([])]).toEqual(["conts", "dc"]);
    expect([...brandsOn([{ brand: "conts", granted: false }])]).toEqual(["dc"]);
    expect([...brandsOn([{ brand: "dc", granted: true }])]).toEqual(["conts", "dc"]);
  });

  it("keep only what was taken off: a pill pressed twice leaves nothing", () => {
    const off = toggleBrand([], "dc");
    expect(off).toEqual([{ brand: "dc", granted: false }]);
    expect(toggleBrand(off, "dc")).toEqual([]);
    expect(sameBrandTicks(toggleBrand(toggleBrand([], "conts"), "dc"), [{ brand: "dc", granted: false }, { brand: "conts", granted: false }])).toBe(true);
  });

  it("are sent as a short list of known brands, each once", () => {
    expect(isBrandTickList([])).toBe(true);
    expect(isBrandTickList([{ brand: "dc", granted: false }])).toBe(true);
    expect(isBrandTickList([{ brand: "dc", granted: false }, { brand: "dc", granted: true }])).toBe(false);
    expect(isBrandTickList([{ brand: "fair", granted: false }])).toBe(false);
    expect(isBrandTickList([{ brand: "dc" }])).toBe(false);
    expect(isBrandTickList("dc")).toBe(false);
  });

  it("read the window's answer, dropping what it does not know", () => {
    expect(brandTicksFromJson([{ brand: "dc", granted: false }, { brand: "x", granted: false }, null])).toEqual([{ brand: "dc", granted: false }]);
    expect(brandTicksFromJson(null)).toEqual([]);
    expect(sortedBrandTicks([{ brand: "dc", granted: false }, { brand: "conts", granted: false }]).map(t => t.brand)).toEqual(["conts", "dc"]);
  });
});

// The database names a brand by the same numbers and Pages the app does (crm-source.ts › ACCOUNTS).
describe("crm_brand_of()", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261117160000_brand_ticks.sql"), "utf8");
  const pairs = [...sql.matchAll(/WHEN '(\d+)'\s+THEN '(conts|dc)'/g)].map(m => [m[1], m[2]] as const);

  it("knows the app's four numbers and Pages, each as the app does", () => {
    expect(pairs).toHaveLength(4);
    for (const [account, brand] of pairs) expect(brandOf(account)).toBe(brand);
  });
});
