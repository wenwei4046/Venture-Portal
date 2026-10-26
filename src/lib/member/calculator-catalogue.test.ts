import { describe, expect, it } from "vitest";
import { calculateQuote, customerQuote, type QuotePricing } from "./calculator";
import type { MemberBand, MemberProduct, QuoteInput } from "./types";

/**
 * The calculator at the portal's own prices (user 2026-09-24) — the twin of
 * how the run costs the same sale (catalogue_line_cost + catalogue_apply_combos,
 * migration 20260924030000): SKU price at the build, and a sofa's matched combo
 * costed as the combo. Every option priced on Maintenance is CHARGED to the
 * customer on top (2026-10-06) — never part of the cost.
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
    { pool: "bedframe_specials", value: "Hydraulic", price: 300 },
  ],
  combos: [],
  models: [
    { id: "soffio", kind: "SOFA", options: { leg_heights: ["Default", '4"'], specials: ["Nylon Fabric", "Pillow Back"] } },
    { id: "y04", kind: "BEDFRAME", options: { divan_heights: ['8"', '10"'], specials: ["Hydraulic", "HB Straight"] } },
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

// 2026-10-06 (user): "我要那些价钱是不会算进 margin 的，加 100 就一定 default calculator 100" —
// every price keyed on Maintenance is what the CUSTOMER pays, on top, out of the
// margin; a sofa's "整组 sofa 只加一次" — once per sofa, however many pieces.
describe("option charges", () => {
  it("charges a sofa's leg and special once per sofa, on top of the price — two of a module are two sofas", () => {
    const r = calculateQuote(quote([one("a", 2)], { ...sofa, leg: '4"', specials: ["Nylon Fabric"] }), products, bands, undefined, pricing());
    expect(r.valid).toBe(true);
    expect(r.margin).toBeCloseTo(margin(2 * 1000), 10);
    expect(r.optionCharge).toBe(2 * (30 + 50));
    expect(r.optionCharges).toEqual([{ label: '8030 SOFFIO · leg 4" · Nylon Fabric', qty: 2, amount: 160 }]);
    expect(r.customerPays).toBe(5160);
  });

  it("charges a three-piece sofa once, not once a piece", () => {
    const r = calculateQuote(quote([one("a"), one("b"), one("c")], { ...sofa, leg: '4"', specials: ["Nylon Fabric"] }), products, bands, undefined, pricing());
    expect(r.margin).toBeCloseTo(margin(1000 + 1500 + 400), 10);
    expect(r.optionCharge).toBe(80);
    expect(r.optionCharges).toEqual([{ label: '8030 SOFFIO · leg 4" · Nylon Fabric', qty: 1, amount: 80 }]);
  });

  it("charges nothing for an option the portal has not priced", () => {
    const r = calculateQuote(quote([one("a")], { ...sofa, leg: "Default", specials: ["Pillow Back"] }), products, bands, undefined, pricing());
    expect(r.margin).toBeCloseTo(margin(1000), 10);
    expect(r.optionCharge).toBe(0);
  });

  // 2026-10-26 (user): "比如 change 8030 back cushion，一个沙发可能有三个 compartment（三个 seat），所以这个东西应该要乘三" —
  // a special Maintenance charges BY QUANTITY is its price each, times the quantity set, once for the cart.
  describe("a special charged by quantity", () => {
    const counted = () => pricing({
      options: [...pricing().options, { pool: "sofa_specials", value: "Change 8030 Backcushion", price: 200 }],
      models: [{
        id: "soffio", kind: "SOFA",
        options: { leg_heights: ["Default", '4"'], specials: ["Nylon Fabric", "Change 8030 Backcushion"] },
        charges: { specials: [{ value: "Nylon Fabric", charge: 50 }, { value: "Change 8030 Backcushion", charge: 200, byQuantity: true }] },
      }, pricing().models[1]],
    });

    it("charges each times the quantity — three back cushions, RM 600 — beside what is charged once per sofa", () => {
      const r = calculateQuote(quote([one("a"), one("b")], {
        ...sofa, leg: '4"', specials: ["Nylon Fabric", "Change 8030 Backcushion"], specialQty: { "Change 8030 Backcushion": 3 },
      }), products, bands, undefined, counted());
      expect(r.valid).toBe(true);
      expect(r.margin).toBeCloseTo(margin(1000 + 1500), 10);
      expect(r.optionCharge).toBe(30 + 50 + 3 * 200);
      expect(r.optionCharges).toEqual([
        { label: '8030 SOFFIO · leg 4" · Nylon Fabric', qty: 1, amount: 80 },
        { label: "Change 8030 Backcushion", qty: 3, amount: 600 },
      ]);
      expect(r.customerPays).toBe(5680);
    });

    it("counts it once for the cart, however many sofas; one picked with no quantity counts 1", () => {
      const two = calculateQuote(quote([one("a", 2)], { ...sofa, specials: ["Change 8030 Backcushion"], specialQty: { "Change 8030 Backcushion": 5 } }),
        products, bands, undefined, counted());
      expect(two.optionCharges).toEqual([{ label: "Change 8030 Backcushion", qty: 5, amount: 1000 }]);
      const none = calculateQuote(quote([one("a")], { ...sofa, specials: ["Change 8030 Backcushion"] }), products, bands, undefined, counted());
      expect(none.optionCharge).toBe(200);
    });

    it("refuses a quantity for a special the build does not have", () => {
      const r = calculateQuote(quote([one("a")], { ...sofa, specials: ["Nylon Fabric"], specialQty: { "Change 8030 Backcushion": 2 } }),
        products, bands, undefined, counted());
      expect(r.valid).toBe(false);
      expect(r.error).toMatch(/quantity no longer matches/);
    });

    it("says the quantity on the customer's quote", () => {
      const input = quote([one("a")], { ...sofa, specials: ["Change 8030 Backcushion", "Nylon Fabric"], specialQty: { "Change 8030 Backcushion": 3 } });
      const r = calculateQuote(input, products, bands, undefined, counted());
      expect(customerQuote(input, products, r)).toContain("Sofa build: seat height 30 · Tier 2 fabric · Change 8030 Backcushion ×3, Nylon Fabric");
    });
  });

  // 2026-10-05: a bed frame's divan is CHARGED to the customer; since 2026-10-06 its special too.
  it("charges a bed frame's divan and special on top of the price, out of the margin", () => {
    const r = calculateQuote(
      quote([one("y04-q")], { bedframe: { divan: '10"', specials: ["Hydraulic", "HB Straight"] } }, "2000"),
      products,
      bands,
      undefined,
      pricing(),
    );
    expect(r.margin).toBeCloseTo(margin(800, 2000), 10);
    expect(r.optionCharge).toBe(400);
    expect(r.optionCharges).toEqual([{ label: 'Y04 · divan 10" · Hydraulic', qty: 1, amount: 400 }]);
    expect(r.customerPays).toBe(2400);
  });

  it("refuses an option the cart's models were not ticked for", () => {
    const r = calculateQuote(quote([one("a")], { ...sofa, leg: '6"' }), products, bands, undefined, pricing());
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/leg height/);
  });

  it("leaves a charge out of the cost the divisor works on — it is the customer's price", () => {
    const r = calculateQuote(quote([one("a")], { ...sofa, leg: '4"' }), products, bands, { costDivisor: 0.5 }, pricing());
    expect(r.margin).toBeCloseTo(margin(1000 / 0.5), 10);
    expect(r.optionCharge).toBe(30);
  });
});

describe("sofa combos — exactly the set, at the portal's price", () => {
  // User 2026-10-08 chose "完全一样才算" — the ERP costed the set inside a bigger build.
  it("a piece more is not the set: every module keeps its own price", () => {
    const r = calculateQuote(
      quote([one("a"), one("b"), one("c")], sofa),
      products,
      bands,
      undefined,
      pricing({ combos: [lShape] }),
    );
    // 1A(LHF) + 2NA + a console is not the L-shape set: 1,000 + 1,500 + 400.
    expect(r.margin).toBeCloseTo(margin(1000 + 1500 + 400), 10);
    const set = calculateQuote(quote([one("a"), one("b")], sofa), products, bands, undefined, pricing({ combos: [lShape] }));
    expect(set.margin).toBeCloseTo(margin(2000), 10);
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

  // 2026-10-21 (user: 0 = 还没定价): a module whose cell at the seat is 0 is not costed at RM 0 — the Quote refuses the
  // seat, as it refuses one the grid does not carry (member_catalogue no longer offers it either).
  it("never costs a module at a cell priced 0", () => {
    const zero = { ...module_("z", "1A(LHF)", 0, "35"), costGrid: [{ height: "35", tier: "PRICE_2", cost: 0 }], options: [{ height: "35", tier: "PRICE_2" }] };
    const r = calculateQuote(quote([one("z")], { height: "35", tier: "PRICE_2" }), [zero], bands, undefined, pricing());
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/seat height is not available/);
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

  // 2026-10-21, production's Product List: a SOFFIO quote of 1A(LHF) + 1A(RHF) + Console at seat 35, fabric 1, sold at
  // RM 4,490, read 19.8% — the modules at their own 910 + 910 + 700 — though the set is priced RM 2,140 at 35. The set
  // was made on the retired 8030-CONSOLE's module code; the Quote sells 8030-Console.
  it("costs a 1A(LHF) + 1A(RHF) + Console cart as its CONSOLE set, whatever the case", () => {
    const at35 = (id: string, module: string, price: number) => ({
      ...module_(id, module, price, "35"),
      costGrid: [{ height: "35", tier: "PRICE_1", cost: price }],
      options: [{ height: "35", tier: "PRICE_1" }],
    });
    const soffio = [at35("l", "1A(LHF)", 910), at35("r", "1A(RHF)", 910), at35("k", "Console", 700)];
    const set = {
      erpId: "portal:13d48e86-ba6e-46b9-b867-33231919bf2a",
      baseModel: "8030",
      modules: [["1A(LHF)"], ["1A(RHF)"], ["CONSOLE"]],
      tier: "PRICE_1",
      label: "1A(LHF) + 1A(RHF) + CONSOLE",
      effectiveFrom: "2026-10-21",
      createdAt: "2026-10-21T06:35:18.719825+00:00",
      priceByHeight: { "24": 1744, "26": 1744, "28": 1744, "30": 1744, "35": 2140 },
    };
    const pair = { ...set, erpId: "portal:aad8c7ba", modules: [["1A(LHF)"], ["1A(RHF)"]], label: "1A(LHF) + 1A(RHF)", priceByHeight: { "35": 1720 } };
    const cart = quote([one("l"), one("r"), one("k")], { height: "35", tier: "PRICE_1" }, "4490");
    const r = calculateQuote(cart, soffio, bands, { costDivisor: 0.7 }, pricing({ combos: [set, pair] }));
    expect(r.valid).toBe(true);
    // 2,140 spread 772.79 / 772.77 / 594.44 by the modules' own costs, each ÷ 0.7 to the cent: 3,057.15.
    expect(r.margin).toBeCloseTo(margin(1103.99 + 1103.96 + 849.2, 4490), 10);
    expect(r.margin).toBeCloseTo(31.91, 2);
    const own = calculateQuote(cart, soffio, bands, { costDivisor: 0.7 }, pricing({ combos: [pair] }));
    expect(own.margin).toBeCloseTo(margin(1300 + 1300 + 1000, 4490), 10); // 19.82%: what the screen said
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
