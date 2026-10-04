import { describe, expect, it } from "vitest";
import { calculateQuote, type QuotePricing } from "./calculator";
import { quoteCostRatios, quoteKpiItems } from "./quote-rules";
import type { MemberBand, MemberProduct, QuoteInput, QuoteRules } from "./types";

/**
 * Product List › Costing Setting and › Add-on / KPI Items in the calculator
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
    // Cost: 1,000 + 1,500 plus Nylon's RM 50 surcharge on each module.
    expect(r.margin).toBeCloseTo(((6000 - 2600) / 6000) * 100, 10);
  });

  it("prices the next tier as cost ÷ (1 − t) — the selling price, the add-on still on top", () => {
    const r = calculateQuote(
      quote([one("a")], { ...sofa, specials: ["Nylon Fabric"] }, "1250"),
      products,
      bands,
      { costDivisor: 1, kpiItems: [NYLON] },
      pricing,
    );
    // 1,250 of selling price against 1,050 of cost: 16%, below the 20% bar.
    expect(r.margin).toBeCloseTo(16, 10);
    expect(r.multiplier).toBe(0.5);
    expect(r.nextThreshold).toBe(30);
    expect(r.nextPrice).toBe(1500); // 1,050 ÷ 0.70
    expect(r.customerPays).toBe(1400);
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
