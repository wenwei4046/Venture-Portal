import { describe, expect, it } from "vitest";
import type { MemberBand, QuoteResult } from "@/lib/member/types";
import { calcVM, press, priceText, quoteInput } from "./calc-model";
import { tableCalc } from "./table-calc";
import type { CartLine } from "./quote-model";

const band = (key: string, kind: MemberBand["kind"], threshold: number, multiplier: number | null = null): MemberBand =>
  ({ brand: "AKEMI", key, kind, threshold, multiplier, amount: 0 });
// Akemi's ladder as comm_margin_bands holds it.
const BANDS = [
  band("Incentive Tier 2", "incentive", 43), band("Incentive Tier 1", "incentive", 36), band("Standard margin", "reference", 33),
  band("Low margin", "reference", 30), band("Below margin Tier 1", "penalty", 27, 0.5), band("Below margin Tier 2", "penalty", 25, 0.25),
  band("Below margin Tier 3", "penalty", 24, 0),
];
const result = (margin: number, next: [number, number] | null = null): QuoteResult => ({
  valid: true, price: 0, delivery: 0, margin, label: "", tone: "neutral", multiplier: 1,
  nextPrice: next ? next[1] : null, nextThreshold: next ? next[0] : null, boundary: null, version: "", inputKey: "", suggestions: [],
});
const line = (id: string, productId: string, qty: number, kind: CartLine["kind"] = "mattress"): CartLine =>
  ({ id, kind, key: id, name: id, size: "", qty, productId });

describe("the keypad", () => {
  it("types digits, one point, two decimals and eight digits at most", () => {
    let p = "";
    for (const k of ["0", "5", "4", "8", "0"]) p = press(p, k);
    expect(p).toBe("5480");
    expect(press(press(p, "."), ".")).toBe("5480.");
    expect(press(press(press("5480.", "5"), "0"), "1")).toBe("5480.50");
    expect(press("12345678", "9")).toBe("12345678");
    expect(press("", ".")).toBe("0.");
    expect(press("5480", "del")).toBe("548");
  });

  it("writes the price with separators as typed", () => {
    expect(priceText("5480")).toBe("5,480");
    expect(priceText("5480.5")).toBe("5,480.5");
    expect(priceText("")).toBe("0");
  });
});

describe("what the server is asked", () => {
  it("sums a SKU over its lines, sends the price and fee in sen, and the seat height only with a sofa", () => {
    const cart = [line("a", "p1", 1), line("b", "p1", 2), line("c", "p2", 1, "frame")];
    expect(quoteInput("scheme", cart, "5480", "12.5", { height: "60cm", tier: "PRICE_1" })).toEqual({
      schemeId: "scheme", price: "5480.00", delivery: "12.50", build: undefined,
      lines: [{ productId: "p1", quantity: 3, gift: false }, { productId: "p2", quantity: 1, gift: false }],
    });
    expect(quoteInput("scheme", [line("s", "p3", 1, "sofa")], "100", "", { height: "60cm", tier: "PRICE_1" })?.build).toEqual({ height: "60cm", tier: "PRICE_1" });
  });

  it("asks nothing without a cart or a price", () => {
    expect(quoteInput("scheme", [], "100", "", { height: null, tier: null })).toBeNull();
    expect(quoteInput("scheme", [line("a", "p1", 1)], "", "", { height: null, tier: null })).toBeNull();
    expect(quoteInput("scheme", [line("a", "p1", 1)], "0.", "", { height: null, tier: null })).toBeNull();
  });
});

describe("step 2's card", () => {
  it("asks for products, then a price", () => {
    expect(calcVM({ price: "", items: 0, bands: BANDS, result: null, error: null })).toMatchObject({ tierLabel: "Add products", marginText: "—", hint: "Choose a model to continue" });
    expect(calcVM({ price: "", items: 2, bands: BANDS, result: null, error: null })).toMatchObject({ tierLabel: "Enter a price", hint: "Next: enter your selling price" });
  });

  it("reads the margin on the brand's own ladder, with the next incentive and its price", () => {
    const vm = calcVM({ price: "5480", items: 3, bands: BANDS, result: result(34.64, [36, 5596.88]), error: null });
    expect(vm).toMatchObject({ marginText: "34.6%", tierLabel: "Standard margin", tone: "neutral", penalty: null,
      next: { tier: "Incentive Tier 1 (36%)", price: "RM 5,596.88" } });
  });

  it("names the penalty and what it does to the commission", () => {
    expect(calcVM({ price: "4000", items: 2, bands: BANDS, result: result(24, [36, 4752.24]), error: null }))
      .toMatchObject({ tierLabel: "Below margin Tier 3", tone: "bad", penalty: "No commission" });
    expect(calcVM({ price: "4000", items: 2, bands: BANDS, result: result(26), error: null }))
      .toMatchObject({ tierLabel: "Below margin Tier 1", penalty: "Commission × 0.5" });
  });

  it("says why there is no margin", () => {
    expect(calcVM({ price: "100", items: 1, bands: BANDS, result: null, error: "Product cost is pending a Principal update." }))
      .toMatchObject({ tierLabel: "Cost pending", note: "Product cost is pending a Principal update." });
  });

  it("adds KPI items on top of the price", () => {
    const vm = calcVM({ price: "1000", items: 3, bands: BANDS, result: result(40), error: null, kpi: { qty: 2, amount: 500 }, fee: "50" });
    expect(vm.kpi).toEqual({ label: "2 KPI items", total: "RM 500" });
    expect(vm.options).toBeNull();
    expect(vm.pay).toBe("RM 1,550");
  });

  // 2026-10-05: a bed frame's charged divan, leg and gap ride on top too.
  it("adds the bed frames' option charges on top of the price, with the KPI items", () => {
    const vm = calcVM({ price: "1000", items: 3, bands: BANDS, result: result(40), error: null, kpi: { qty: 2, amount: 500 }, options: 120, fee: "50" });
    expect(vm.options).toEqual({ total: "RM 120" });
    expect(vm.pay).toBe("RM 1,670");
    const plain = calcVM({ price: "1000", items: 1, bands: BANDS, result: result(40), error: null, options: 0 });
    expect(plain.options).toBeNull();
    expect(plain.pay).toBeNull();
  });

  // 2026-10-05 (user): how the cost is made up is never shown — the note under
  // Additional fee that said "team cost basis (cost ÷ 0.7)" is gone.
  it("never says how the cost behind the margin is made up", () => {
    const vm = calcVM({ price: "5000", items: 2, bands: BANDS, result: result(35.7), error: null, kpi: { qty: 1, amount: 100 }, options: 120, fee: "80" });
    expect(JSON.stringify(vm)).not.toMatch(/÷|team cost|cost basis|divisor/i);
  });
});

describe("the preview's calculator", () => {
  it("answers the prototype's own figures (RM 5,480 → 34.6%, Tier 1 at RM 5,596.88)", () => {
    const table = {
      m: { list: 3890, cost: 3890 * 0.42, name: "Serene Pocket", kpi: false },
      f: { list: 1590, cost: 1590 * 0.44, name: "Haven Divan", kpi: false },
      a: { list: 290, cost: 290 * 0.3, name: "Latex Contour Pillow", kpi: false },
    };
    const r = tableCalc({ schemeId: "s", price: "5480.00", delivery: "0", lines: [
      { productId: "m", quantity: 1, gift: false }, { productId: "f", quantity: 1, gift: false }, { productId: "a", quantity: 2, gift: false },
    ] }, table, 0.7, [36, 43]);
    expect(r.ok && r.data.margin?.toFixed(1)).toBe("34.6");
    expect(r.ok && r.data.nextPrice).toBe(5596.88);
    expect(r.ok && r.data.nextThreshold).toBe(36);
  });
});

// 2026-10-05: one bed frame built two ways is two lines for the server.
describe("quoteInput — a bed frame's own build", () => {
  const line = (id: string, qty: number, bedframe?: { leg?: string }): CartLine =>
    ({ id, kind: "frame", key: "m-cody", name: "CODY", size: "King", qty, productId: "cody-k", ...(bedframe ? { bedframe, charge: 100 } : {}) });

  it("sends each build of one SKU as its own line, and merges the same build", () => {
    const input = quoteInput("fair", [line("a", 1), line("b", 2, { leg: '6"' }), line("c", 1, { leg: '6"' })], "4000", "", { height: null, tier: null });
    expect(input?.lines).toEqual([
      { productId: "cody-k", quantity: 1, gift: false },
      { productId: "cody-k", quantity: 3, gift: false, bedframe: { leg: '6"' } },
    ]);
  });
});
