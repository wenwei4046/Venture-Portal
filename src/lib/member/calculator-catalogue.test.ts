import { describe, expect, it } from "vitest";
import { calculateQuote, customerQuote, type QuotePricing } from "./calculator";
import type { MemberBand, MemberProduct, QuoteInput } from "./types";

/**
 * The calculator at the portal's own prices (user 2026-09-24) — the twin of
 * how the run costs the same sale (catalogue_line_cost + catalogue_apply_combos,
 * migration 20260924030000): SKU price at the build + option surcharges, and a
 * sofa's matched combo costed as the combo.
 */

const bands: MemberBand[] = [
  { brand: "ZANOTTI", key: "Tier 1", kind: "incentive", threshold: 30, multiplier: null, amount: 1000 },
  { brand: "ZANOTTI", key: "x0.5", kind: "penalty", threshold: 20, multiplier: 0.5, amount: 0 },
];

const module_ = (id: string, module: string, price: number | null, height = "30"): MemberProduct => ({
  id,
  code: `8030-${module}`,
  name: "8030 SOFFIO",
  brand: "ZANOTTI",
  category: "Sofa",
  size: module,
  color: "",
  available: true,
  gift: false,
  modelId: "soffio",
  kind: "SOFA",
  baseModel: "8030",
  moduleCode: module,
  cost: null,
  costGrid: price === null ? [] : [{ height, tier: "PRICE_2", cost: price }],
  options: [{ height, tier: "PRICE_2" }],
  version: "v1",
});

const frame: MemberProduct = {
  id: "y04-q",
  code: "Y04-(Q)",
  name: "Y04",
  brand: null,
  category: "Bed frame",
  size: "Queen",
  color: "",
  available: true,
  gift: false,
  modelId: "y04",
  kind: "BEDFRAME",
  cost: 800,
  version: "v1",
};

const products = [
  module_("a", "1A(LHF)", 1000),
  module_("b", "2NA", 1500),
  module_("c", "CONSOLE", 400),
  module_("u", "1NA", null),
  frame,
];

const pricing = (over: Partial<QuotePricing> = {}): QuotePricing => ({
  options: [
    { pool: "sofa_leg_heights", value: '4"', price: 30 },
    { pool: "sofa_specials", value: "Nylon Fabric", price: 50 },
    { pool: "bedframe_divan_heights", value: '10"', price: 100 },
    { pool: "bedframe_specials", value: "No Side Panel", price: -40 },
  ],
  combos: [],
  models: [
    { id: "soffio", kind: "SOFA", options: { leg_heights: ["Default", '4"'], specials: ["Nylon Fabric", "Pillow Back"] } },
    { id: "y04", kind: "BEDFRAME", options: { divan_heights: ['8"', '10"'], specials: ["No Side Panel"] } },
  ],
  ...over,
});

const lShape = {
  erpId: "c1",
  baseModel: "8030",
  modules: [["1A(LHF)"], ["2NA"]],
  tier: null,
  label: "L-shape",
  effectiveFrom: "2026-01-01",
  createdAt: null,
  priceByHeight: { "30": 2000 },
};

const quote = (lines: QuoteInput["lines"], build: QuoteInput["build"], price = "5000"): QuoteInput => ({
  schemeId: "fair",
  lines,
  price,
  delivery: "0",
  build,
});
const one = (id: string, quantity = 1) => ({ productId: id, quantity, gift: false });
const sofa = { height: "30", tier: "PRICE_2" };
const margin = (cost: number, price = 5000) => ((price - cost) / price) * 100;

describe("option surcharges", () => {
  it("adds each chosen option's surcharge per unit, times quantity", () => {
    const r = calculateQuote(quote([one("a", 2)], { ...sofa, leg: '4"', specials: ["Nylon Fabric"] }), products, bands, undefined, pricing());
    expect(r.valid).toBe(true);
    expect(r.margin).toBeCloseTo(margin(2 * (1000 + 30 + 50)), 10);
  });

  it("adds nothing for an option the portal has not priced", () => {
    const r = calculateQuote(quote([one("a")], { ...sofa, leg: "Default", specials: ["Pillow Back"] }), products, bands, undefined, pricing());
    expect(r.margin).toBeCloseTo(margin(1000), 10);
  });

  it("lets a surcharge take money off (the ERP's No Side Panel)", () => {
    const r = calculateQuote(
      quote([one("y04-q")], { bedframe: { divan: '10"', specials: ["No Side Panel"] } }, "2000"),
      products,
      bands,
      undefined,
      pricing(),
    );
    expect(r.margin).toBeCloseTo(margin(800 + 100 - 40, 2000), 10);
  });

  it("refuses an option the cart's models were not ticked for", () => {
    const r = calculateQuote(quote([one("a")], { ...sofa, leg: '6"' }), products, bands, undefined, pricing());
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/leg height/);
  });

  it("applies the cost divisor to the options too", () => {
    const r = calculateQuote(quote([one("a")], { ...sofa, leg: '4"' }), products, bands, { costDivisor: 0.5 }, pricing());
    expect(r.margin).toBeCloseTo(margin((1000 + 30) / 0.5), 10);
  });
});

describe("sofa combos — the ERP's rule at the portal's price", () => {
  it("costs the matched modules at the combo, the extras at their own price", () => {
    const r = calculateQuote(
      quote([one("a"), one("b"), one("c")], sofa),
      products,
      bands,
      undefined,
      pricing({ combos: [lShape] }),
    );
    // 1A(LHF) + 2NA = one L-shape set at 2,000; the console stays at 400.
    expect(r.margin).toBeCloseTo(margin(2000 + 400), 10);
  });

  it("the combo always wins, dearer or not, and replaces the options on its modules", () => {
    const dear = { ...lShape, priceByHeight: { "30": 3000 } };
    const r = calculateQuote(quote([one("a"), one("b")], { ...sofa, leg: '4"' }), products, bands, undefined, pricing({ combos: [dear] }));
    expect(r.margin).toBeCloseTo(margin(3000), 10);
  });

  it("prices a uniform quantity as that many sets, and leaves mixed quantities at their own cost", () => {
    const two = calculateQuote(quote([one("a", 2), one("b", 2)], sofa), products, bands, undefined, pricing({ combos: [lShape] }));
    expect(two.margin).toBeCloseTo(margin(2 * 2000), 10);
    const mixed = calculateQuote(quote([one("a", 2), one("b", 1)], sofa), products, bands, undefined, pricing({ combos: [lShape] }));
    expect(mixed.margin).toBeCloseTo(margin(2 * 1000 + 1500), 10);
  });

  it("costs a module the portal never priced when a priced combo covers it", () => {
    const withUnpriced = { ...lShape, modules: [["1A(LHF)"], ["1NA"]] };
    const r = calculateQuote(quote([one("a"), one("u")], sofa), products, bands, undefined, pricing({ combos: [withUnpriced] }));
    expect(r.valid).toBe(true);
    expect(r.margin).toBeCloseTo(margin(2000), 10);
    const alone = calculateQuote(quote([one("a"), one("u")], sofa), products, bands, undefined, pricing());
    expect(alone.valid).toBe(false);
    expect(alone.error).toMatch(/cost is pending/);
  });

  it("is no combo at a seat height the portal did not price it at", () => {
    const at24 = { ...lShape, priceByHeight: { "24": 2000 } };
    const r = calculateQuote(quote([one("a"), one("b")], sofa), products, bands, undefined, pricing({ combos: [at24] }));
    expect(r.margin).toBeCloseTo(margin(2500), 10);
  });

  it("prefers the combo written for the build's tier over an any-tier one", () => {
    const tiered = { ...lShape, erpId: "c2", tier: "PRICE_2", priceByHeight: { "30": 1800 } };
    const r = calculateQuote(quote([one("a"), one("b")], sofa), products, bands, undefined, pricing({ combos: [lShape, tiered] }));
    expect(r.margin).toBeCloseTo(margin(1800), 10);
  });

  it("applies the divisor to the combo's share", () => {
    const r = calculateQuote(quote([one("a"), one("b")], sofa), products, bands, { costDivisor: 0.7 }, pricing({ combos: [lShape] }));
    // Each line's team cost is rounded to the cent (800 → 1,142.86; 1,200 → 1,714.29).
    expect(r.margin).toBeCloseTo(margin(1142.86 + 1714.29), 10);
  });
});

describe("the quote is bound to its whole build", () => {
  it("treats a changed leg height or special as a different quote", () => {
    const input = quote([one("a")], { ...sofa, leg: '4"', specials: ["Nylon Fabric"] });
    const r = calculateQuote(input, products, bands, undefined, pricing());
    expect(customerQuote(input, products, r)).toContain('Sofa build: seat height 30 · Tier 2 fabric · leg 4" · Nylon Fabric');
    expect(() => customerQuote({ ...input, build: { ...sofa, leg: "Default", specials: ["Nylon Fabric"] } }, products, r)).toThrow("changed");
    expect(() => customerQuote({ ...input, build: { ...sofa, leg: '4"' } }, products, r)).toThrow("changed");
    // The order the specials were ticked in is not a change.
    const both = quote([one("a")], { ...sofa, specials: ["Nylon Fabric", "Pillow Back"] });
    const rb = calculateQuote(both, products, bands, undefined, pricing());
    expect(() => customerQuote({ ...both, build: { ...sofa, specials: ["Pillow Back", "Nylon Fabric"] } }, products, rb)).not.toThrow();
  });
});
