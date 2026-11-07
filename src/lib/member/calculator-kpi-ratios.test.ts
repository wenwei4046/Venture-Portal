import { describe, expect, it } from "vitest";
import { calculateQuote, type QuotePricing } from "./calculator";
import { quoteCostRatios, quoteCostRules, quoteKpiItems } from "./quote-rules";
import type { MemberBand, MemberProduct, QuoteInput, QuoteRules } from "./types";

/**
 * Product List › Costing Setting and Rules › KPI items in the calculator
 * (2026-09-27): a SKU's own cost ratio, and a cart's KPI items paid flat as
 * KPI — so its margin is the main price's, the one the run will judge.
 */

const bands: MemberBand[] = [
  { brand: "ZANOTTI", key: "Tier 1", kind: "incentive", threshold: 30, multiplier: null, amount: 1000 },
  { brand: "ZANOTTI", key: "x0.5", kind: "penalty", threshold: 20, multiplier: 0.5, amount: 0 },
];

const sofaModule = (id: string, module: string, price: number): MemberProduct => ({
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
  costGrid: [{ height: "30", tier: "PRICE_2", cost: price }],
  options: [{ height: "30", tier: "PRICE_2" }],
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

const products = [sofaModule("a", "1A(LHF)", 1000), sofaModule("b", "2NA", 1500), frame];

const pricing: QuotePricing = {
  options: [{ pool: "sofa_specials", value: "Nylon Fabric", price: 50 }],
  combos: [],
  models: [
    { id: "soffio", kind: "SOFA", options: { specials: ["Nylon Fabric", "Wooden Arm"] } },
    { id: "y04", kind: "BEDFRAME", options: { specials: ["HB Straight", "No Side Panel"] } },
  ],
};

const quote = (lines: QuoteInput["lines"], build: QuoteInput["build"], price: string): QuoteInput => ({
  schemeId: "fair",
  lines,
  price,
  delivery: "0",
  build,
});
const one = (id: string, quantity = 1) => ({ productId: id, quantity, gift: false });
const sofa = { height: "30", tier: "PRICE_2" };

const HB_STRAIGHT = { source: "option" as const, optionPool: "bedframe_specials" as const, optionValue: "HB Straight", kpiAmount: 200 };
const NYLON = { source: "option" as const, optionPool: "sofa_specials" as const, optionValue: "Nylon Fabric", kpiAmount: 150 };

describe("a SKU's own cost ratio", () => {
  it("divides that SKU's cost by its ratio, the rest by the department's", () => {
    const rules: QuoteRules = { costDivisor: 1, costRatios: [{ productCode: "y04-(q)", ratio: 0.5 }] };
    const r = calculateQuote(quote([one("y04-q")], undefined, "2000"), products, bands, rules, pricing);
    expect(r.valid).toBe(true);
    expect(r.margin).toBeCloseTo(((2000 - 1600) / 2000) * 100, 10); // 800 ÷ 0.5
    const plain = calculateQuote(quote([one("y04-q")], undefined, "2000"), products, bands, { costDivisor: 1 }, pricing);
    expect(plain.margin).toBeCloseTo(60, 10);
  });
});

// 2026-11-07 (Costing Setting): a bed frame rides on a cart of any brand and is judged on that
// brand's ladder, so it divides by its ratio for that brand — the brand the cart answers to, as
// the run reads the bill. Unset: the SKU's own ratio, else the department's.
describe("a rider SKU's ratio by brand", () => {
  const rules: QuoteRules = {
    costDivisor: 0.7,
    costRatiosByBrand: [
      { productCode: "Y04-(Q)", brand: "ZANOTTI", ratio: 0.5 },
      { productCode: "Y04-(Q)", brand: "AKEMI", ratio: 0.6 },
    ],
  };

  it("divides a bed frame in a Zanotti cart by its Zanotti ratio", () => {
    // 1A(LHF) 1,000 ÷ 0.7 + Y04 800 ÷ 0.5 = 1,428.57 + 1,600.
    const r = calculateQuote(quote([one("a"), one("y04-q")], sofa, "6000"), products, bands, rules, pricing);
    expect(r.valid).toBe(true);
    expect(r.margin).toBeCloseTo(((6000 - 1428.57 - 1600) / 6000) * 100, 10);
  });

  it("keeps the frame's own ratio — else the department's — in a cart with no brand of its own", () => {
    // Riders alone answer to no brand: 800 ÷ 0.7.
    const alone = calculateQuote(quote([one("y04-q")], undefined, "2000"), products, bands, rules, pricing);
    expect(alone.margin).toBeCloseTo(((2000 - 1142.86) / 2000) * 100, 10);
    const own = calculateQuote(quote([one("y04-q")], undefined, "2000"), products, bands,
      { ...rules, costRatios: [{ productCode: "Y04-(Q)", ratio: 0.8 }] }, pricing);
    expect(own.margin).toBeCloseTo(((2000 - 1000) / 2000) * 100, 10);
  });
});

// 2026-11-08 (Product List › GWP — the user: "dullop mattress ecobliss, set a gwp 2 micorfibre pillow. so the
// margin calculator and margin leader will not calculate the cost in for those 2 pillow"): with the mattress in
// the cart, up to two pillows a mattress leave the cost — found by themselves, the Quote unchanged, as the run
// reads the bill (lib/catalogue/gwp.ts).
describe("a gift with purchase leaves the cost", () => {
  const mattress: MemberProduct = {
    id: "eco-q", code: "ECOBLISS (Q)", name: "ECOBLISS", brand: "ZANOTTI", category: "Mattress", size: "Queen",
    color: "", available: true, gift: false, modelId: "eco", kind: "MATTRESS", cost: 1400, version: "v1",
  };
  const pillow = (id: string, code: string, cost: number | null): MemberProduct => ({
    id, code, name: code, brand: null, category: "Pillow", size: "Standard",
    color: "", available: true, gift: true, modelId: id, kind: "ACCESSORY", cost, version: "v1",
  });
  const cart = [mattress, pillow("mf", "MF PILLOW", 35), pillow("latex", "LATEX PILLOW", 70), pillow("nocost", "NEW PILLOW", null)];
  const gift = (id: string, quantity: number) => ({ productId: id, quantity, gift: true });
  const ECO = { id: "eco", buy: ["ECOBLISS (Q)"], gift: ["MF PILLOW", "LATEX PILLOW", "NEW PILLOW"], perUnit: 2 };
  const rules: QuoteRules = { costDivisor: 0.7, gwp: [ECO] };

  it("leaves the two pillows out of the cost: the mattress's alone", () => {
    const r = calculateQuote(quote([one("eco-q"), gift("mf", 2)], undefined, "3000"), cart, bands, rules);
    expect(r.valid).toBe(true);
    expect(r.margin).toBeCloseTo(((3000 - 2000) / 3000) * 100, 10); // 1,400 ÷ 0.7; the pillows 0
    const without = calculateQuote(quote([one("eco-q"), gift("mf", 2)], undefined, "3000"), cart, bands, { costDivisor: 0.7 });
    expect(without.margin).toBeCloseTo(((3000 - 2000 - 100) / 3000) * 100, 10); // 2 × 35 ÷ 0.7
  });

  it("counts a pillow past the allowance, the dearest of them", () => {
    // Two units free of a microfibre (35) and two latex (70): the microfibre and one latex go, one latex stays.
    const r = calculateQuote(quote([one("eco-q"), gift("mf", 1), gift("latex", 2)], undefined, "3000"), cart, bands, rules);
    expect(r.margin).toBeCloseTo(((3000 - 2000 - 100) / 3000) * 100, 10); // 70 ÷ 0.7
  });

  it("gives two a mattress: two mattresses, four pillows", () => {
    const r = calculateQuote(quote([one("eco-q", 2), gift("mf", 4)], undefined, "6000"), cart, bands, rules);
    expect(r.margin).toBeCloseTo(((6000 - 4000) / 6000) * 100, 10);
  });

  it("finds a pillow the member did not add as a free gift too", () => {
    const r = calculateQuote(quote([one("eco-q"), one("mf", 2)], undefined, "3000"), cart, bands, rules);
    expect(r.margin).toBeCloseTo(((3000 - 2000) / 3000) * 100, 10);
  });

  it("needs no price for a pillow wholly given, and still does for one that is not", () => {
    const free = calculateQuote(quote([one("eco-q"), gift("nocost", 1)], undefined, "3000"), cart, bands, rules);
    expect(free.valid).toBe(true);
    expect(free.margin).toBeCloseTo(((3000 - 2000) / 3000) * 100, 10);
    const past = calculateQuote(quote([one("eco-q"), gift("nocost", 3)], undefined, "3000"), cart, bands, rules);
    expect(past.valid).toBe(false);
    expect(past.error).toMatch(/Product cost is pending/);
  });

  it("gives nothing without the mattress", () => {
    const r = calculateQuote(quote([one("y04-q"), gift("mf", 2)], undefined, "3000"), [...cart, frame], bands, rules);
    expect(r.margin).toBeCloseTo(((3000 - 1142.86 - 100) / 3000) * 100, 10); // 800 ÷ 0.7 + 70 ÷ 0.7
  });
});

// 2026-10-05: the price keyed is the SELLING price (the prototype's keypad).
// A KPI item the customer buys rides on top of it, out of the margin, paid flat
// as KPI; one given free comes off it. The run reads the bill the same way:
// its sales are price + K, its main sales — the rate's and the margin's — price.
describe("KPI items in the cart — paid flat as KPI, on top of the price, outside the margin", () => {
  it("puts a bed frame special's amount on top of the price; the margin is the price's", () => {
    const r = calculateQuote(
      quote([one("y04-q")], { bedframe: { specials: ["HB Straight"] } }, "2000"),
      products,
      bands,
      { costDivisor: 1, kpiItems: [HB_STRAIGHT] },
      pricing,
    );
    expect(r.valid).toBe(true);
    expect(r.kpiAmount).toBe(200);
    expect(r.addOnAmount).toBe(200);
    expect(r.kpiItems).toEqual([{ label: "HB Straight", qty: 1, amount: 200 }]);
    expect(r.margin).toBeCloseTo(((2000 - 800) / 2000) * 100, 10);
    expect(r.customerPays).toBe(2200);
  });

  it("counts a bed frame special on every bed frame", () => {
    const r = calculateQuote(
      quote([one("y04-q", 2)], { bedframe: { specials: ["HB Straight"] } }, "4000"),
      products,
      bands,
      { costDivisor: 1, kpiItems: [HB_STRAIGHT] },
      pricing,
    );
    expect(r.kpiAmount).toBe(400);
    expect(r.margin).toBeCloseTo(((4000 - 1600) / 4000) * 100, 10);
    expect(r.customerPays).toBe(4400);
  });

  it("counts a sofa special once, however many modules the sofa has", () => {
    const r = calculateQuote(
      quote([one("a"), one("b")], { ...sofa, specials: ["Nylon Fabric"] }, "6000"),
      products,
      bands,
      { costDivisor: 1, kpiItems: [NYLON] },
      pricing,
    );
    expect(r.kpiAmount).toBe(150);
    // Cost: 1,000 + 1,500. Nylon's RM 50 on Maintenance is the customer's (2026-10-06),
    // charged once for the sofa — not a cost on each module.
    expect(r.margin).toBeCloseTo(((6000 - 2500) / 6000) * 100, 10);
    expect(r.optionCharge).toBe(50);
    expect(r.customerPays).toBe(6000 + 150 + 50);
  });

  it("prices the next tier as cost ÷ (1 − t) — the selling price, the add-on still on top", () => {
    const r = calculateQuote(
      quote([one("a")], { ...sofa, specials: ["Nylon Fabric"] }, "1250"),
      products,
      bands,
      { costDivisor: 1, kpiItems: [NYLON] },
      pricing,
    );
    // 1,250 of selling price against 1,000 of cost: 20%, on the 20% bar. Nylon's RM 50
    // rides on top with the KPI item — the customer's, not a cost (2026-10-06).
    expect(r.margin).toBeCloseTo(20, 10);
    expect(r.multiplier).toBe(0.5);
    expect(r.nextThreshold).toBe(30);
    expect(r.nextPrice).toBe(1428.58); // 1,000 ÷ 0.70, up to the cent
    expect(r.customerPays).toBe(1250 + 150 + 50);
  });

  it("finds a KPI SKU by its code", () => {
    const r = calculateQuote(
      quote([one("y04-q")], undefined, "2000"),
      products,
      bands,
      { costDivisor: 1, kpiItems: [{ source: "sku", productCode: " y04-(q) ", kpiAmount: 100 }] },
      pricing,
    );
    expect(r.kpiAmount).toBe(100);
    expect(r.margin).toBeCloseTo(((2000 - 800) / 2000) * 100, 10);
  });

  it("changes nothing for a special the cart does not carry", () => {
    const r = calculateQuote(quote([one("y04-q")], undefined, "2000"), products, bands, { costDivisor: 1, kpiItems: [HB_STRAIGHT] }, pricing);
    expect(r.kpiAmount).toBe(0);
    expect(r.margin).toBeCloseTo(60, 10);
    expect(r.customerPays).toBe(2000);
  });

  it("takes a FREE KPI item off the price: the customer pays nothing for it", () => {
    const gift = { ...products.find((p) => p.id === "y04-q")!, id: "y04-gift", gift: true };
    const r = calculateQuote(
      quote([one("y04-q"), { productId: "y04-gift", quantity: 1, gift: true }], undefined, "2000"),
      [...products, gift],
      bands,
      { costDivisor: 1, kpiItems: [{ source: "sku", productCode: "Y04-(Q)", kpiAmount: 100 }] },
      pricing,
    );
    expect(r.valid).toBe(true);
    expect(r.kpiAmount).toBe(200);
    expect(r.addOnAmount).toBe(100);
    // 2,000 less the free one's 100, against both frames' 1,600.
    expect(r.margin).toBeCloseTo(((1900 - 1600) / 1900) * 100, 10);
    expect(r.customerPays).toBe(2100);
  });
});

describe("the quote context's rules, read defensively", () => {
  it("keeps only positive ratios", () => {
    expect(quoteCostRatios({ "Y04-(Q)": "0.6", "SOFA-1": 0.7, bad: 0, word: "abc", " ": 0.5 })).toEqual([
      { productCode: "Y04-(Q)", ratio: 0.6 },
      { productCode: "SOFA-1", ratio: 0.7 },
    ]);
    expect(quoteCostRatios(null)).toEqual([]);
    expect(quoteCostRatios([0.6])).toEqual([]);
  });

  // 2026-10-05: the cost rules arrive from member_quote_cost_rules (service role only).
  it("reads the cost rules, and refuses an answer with no usable ratio", () => {
    expect(quoteCostRules({ costDivisor: "0.7000", costRatios: { "Y04-(Q)": 0.6, bad: -1 } })).toEqual({
      costDivisor: 0.7, costRatios: [{ productCode: "Y04-(Q)", ratio: 0.6 }], costRatiosByBrand: [], gwp: [],
    });
    expect(quoteCostRules({ costDivisor: 1 })).toEqual({ costDivisor: 1, costRatios: [], costRatiosByBrand: [], gwp: [] });
    // 2026-11-08: the gifts with purchase, as member_quote_cost_rules hands them.
    expect(quoteCostRules({
      costDivisor: 0.7,
      gwp: [{ id: "g1", buy: ["ECOBLISS (Q)"], gift: ["MF PILLOW"], perUnit: 2 }, { buy: [] }],
    })?.gwp).toEqual([{ id: "g1", buy: ["ECOBLISS (Q)"], gift: ["MF PILLOW"], perUnit: 2 }]);
    // 2026-11-07: a rider SKU's ratio for each brand — anything not a positive number is left out.
    expect(quoteCostRules({
      costDivisor: 0.7,
      costRatioBrands: { "TRION (A)-(K)": { DUNLOP: "0.6000", ERGOTEX: 0.5, AKEMI: 0, ZANOTTI: "x" }, junk: 7, " ": { DUNLOP: 0.6 } },
    })?.costRatiosByBrand).toEqual([
      { productCode: "TRION (A)-(K)", brand: "DUNLOP", ratio: 0.6 },
      { productCode: "TRION (A)-(K)", brand: "ERGOTEX", ratio: 0.5 },
    ]);
    for (const raw of [null, undefined, [], {}, { costDivisor: null }, { costDivisor: 0 }, { costDivisor: -0.7 }, { costDivisor: "abc" }, { costDivisor: "" }, { costDivisor: true }]) {
      expect(quoteCostRules(raw)).toBeNull();
    }
  });

  it("reads the KPI items the context sends, and nothing else", () => {
    expect(
      quoteKpiItems([
        { source: "option", option_pool: "bedframe_specials", option_value: "HB Straight", kpi_amount: "200.00" },
        { source: "sku", product_code: "PILLOW", product_name: "Pillow", kpi_amount: 50 },
        { source: "option", option_pool: "carpet_specials", option_value: "Fringe", kpi_amount: 10 },
        "junk",
      ]),
    ).toEqual([
      { source: "option", optionPool: "bedframe_specials", optionValue: "HB Straight", label: null, kpiAmount: 200 },
      { source: "sku", productCode: "PILLOW", label: "Pillow", kpiAmount: 50 },
    ]);
    expect(quoteKpiItems(undefined)).toEqual([]);
  });
});
