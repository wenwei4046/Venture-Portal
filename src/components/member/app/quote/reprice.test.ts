import { describe, expect, it } from "vitest";
import { calculateQuote, type QuotePricing } from "@/lib/member/calculator";
import type { MemberBand, MemberProduct, QuoteInput, QuoteResult, QuoteRules } from "@/lib/member/types";
import { STAND_IN_PRICE, anchorOf, cartKey, repriced, standIn } from "./reprice";

/**
 * 2026-10-14 (the user: the margin "应该是毫秒级的"): the keypad works every price
 * out from the server's answer at one price. It must answer exactly what the
 * server would have — to the last digit, at every price — for every kind of
 * cart: a mattress alone, with riders, free and bought KPI items, charged
 * options, a sofa set, riders alone, penalties, below cost.
 */

const ladder = (brand: string, rungs: [string, MemberBand["kind"], number, number | null][]): MemberBand[] =>
  rungs.map(([key, kind, threshold, multiplier]) => ({ brand, key, kind, threshold, multiplier, amount: kind === "incentive" ? 500 : 0 }));
// Fair's two ladders as production holds them (2026-10-14).
const AKEMI = ladder("AKEMI", [
  ["Incentive Tier 2", "incentive", 43, null], ["Incentive Tier 1", "incentive", 36, null], ["Standard margin", "reference", 33, null],
  ["Low margin", "reference", 30, null], ["Below margin Tier 1", "penalty", 27, 0.5], ["Below margin Tier 2", "penalty", 25, 0.25],
  ["Below margin Tier 3", "penalty", 24, 0],
]);
const ZANOTTI = ladder("ZANOTTI", [
  ["Incentive Tier 2", "incentive", 36, null], ["Incentive Tier 1", "incentive", 33, null], ["Standard Margin", "reference", 30, null],
  ["Below margin Tier 1", "penalty", 27, 0.5], ["Below margin Tier 2", "penalty", 25, 0.25], ["Below margin Tier 3", "penalty", 24, 0],
]);
const BANDS = [...AKEMI, ...ZANOTTI];
const bandsOf = (brand: string) => BANDS.filter(b => b.brand === brand);

const product = (over: Partial<MemberProduct> & Pick<MemberProduct, "id" | "code">): MemberProduct => ({
  name: over.code, brand: null, category: "Accessory", size: "", color: "", available: true, gift: false, kind: "OTHER", version: "v1", ...over,
});
const module = (id: string, code: string, cost: number) => product({
  id, code: `8030-${code}`, name: "8030 SOFFIO", brand: "ZANOTTI", category: "Sofa", size: code, kind: "SOFA", modelId: "soffio",
  baseModel: "8030", moduleCode: code, cost: null, costGrid: [{ height: "30", tier: "PRICE_2", cost }], options: [{ height: "30", tier: "PRICE_2" }],
});
const PRODUCTS: MemberProduct[] = [
  product({ id: "ak-q", code: "AK-Q", name: "Serene", brand: "AKEMI", category: "Mattress", size: "Queen", kind: "MATTRESS", cost: 1234.56 }),
  product({ id: "ak-k", code: "AK-K", name: "Serene", brand: "AKEMI", category: "Mattress", size: "King", kind: "MATTRESS", cost: 2345.67 }),
  product({ id: "fr-q", code: "FR-(Q)", name: "Haven", category: "Bed frame", size: "Queen", kind: "BEDFRAME", modelId: "haven", cost: 456.78 }),
  product({ id: "pl", code: "PL-1", name: "Latex Pillow", category: "Pillow", size: "Standard", gift: true, cost: 45.5 }),
  module("m1", "1A(LHF)", 1000.01), module("m2", "2NA", 1499.99),
];
const PRICING: QuotePricing = {
  options: [
    { pool: "bedframe_specials", value: "HB Straight", price: 120 },
    { pool: "sofa_specials", value: "Nylon Fabric", price: 50 },
  ],
  combos: [],
  models: [
    { id: "soffio", kind: "SOFA", options: { specials: ["Nylon Fabric"] } },
    { id: "haven", kind: "BEDFRAME", options: { specials: ["HB Straight"] }, charges: { specials: [{ value: "HB Straight", charge: 120 }] } },
  ],
};
const RULES: QuoteRules = {
  costDivisor: 0.7,
  costRatios: [{ productCode: "FR-(Q)", ratio: 0.55 }],
  kpiItems: [
    { source: "sku", productCode: "PL-1", kpiAmount: 30 },
    { source: "option", optionPool: "sofa_specials", optionValue: "Nylon Fabric", kpiAmount: 150 },
  ],
};

/** A cart of each kind the Quote can send, by its brand (the ladder the phone has on screen). */
const CARTS: { name: string; brand: string; cart: Omit<QuoteInput, "price" | "delivery"> }[] = [
  { name: "a mattress", brand: "AKEMI", cart: { schemeId: "fair", lines: [{ productId: "ak-q", quantity: 1, gift: false }] } },
  { name: "two mattresses and a bed frame built with a charged special", brand: "AKEMI", cart: { schemeId: "fair", lines: [
    { productId: "ak-k", quantity: 2, gift: false }, { productId: "fr-q", quantity: 1, gift: false, bedframe: { specials: ["HB Straight"] } },
  ] } },
  { name: "a mattress, a pillow bought and two given free", brand: "AKEMI", cart: { schemeId: "fair", lines: [
    { productId: "ak-q", quantity: 1, gift: false }, { productId: "pl", quantity: 1, gift: false }, { productId: "pl", quantity: 2, gift: true },
  ] } },
  { name: "a sofa set with a charged special that is also a KPI item", brand: "ZANOTTI", cart: { schemeId: "fair", lines: [
    { productId: "m1", quantity: 2, gift: false }, { productId: "m2", quantity: 2, gift: false },
  ], build: { height: "30", tier: "PRICE_2", specials: ["Nylon Fabric"] } } },
  { name: "a bed frame alone — riders, judged on no ladder", brand: "AKEMI", cart: { schemeId: "fair", lines: [
    { productId: "fr-q", quantity: 3, gift: false, bedframe: { specials: ["HB Straight"] } },
  ] } },
];

const answer = (cart: Omit<QuoteInput, "price" | "delivery">, price: string, delivery = "0"): QuoteResult =>
  calculateQuote({ ...cart, price, delivery }, PRODUCTS, BANDS, RULES, PRICING);

/** Seeded, so a failure names prices that can be tried again. */
function prng(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const sen = (n: number) => (n / 100).toFixed(2);
/** Prices from RM 0.01 to RM 1,000,000 — the cart's own neighbourhood most of all, where the tiers are. */
function prices(cartCost: number, count: number, seed: number): string[] {
  const r = prng(seed);
  const out = ["0.01", "1", "99999999.99", STAND_IN_PRICE];
  for (let i = 0; i < count; i++) {
    const near = r() < 0.75;
    const value = near ? Math.round(cartCost * (0.8 + r() * 1.2) * 100) : Math.round(r() ** 3 * 100000000) + 1;
    out.push(sen(value));
  }
  return out;
}
const PRICED_KEYS = ["price", "delivery", "margin", "label", "tone", "multiplier", "nextPrice", "nextThreshold", "boundary",
  "kpiAmount", "addOnAmount", "optionCharge", "customerPays", "kpiItems", "optionCharges", "version", "valid"] as const;

describe("the keypad's margin is the server's, at every price", () => {
  it.each(CARTS)("$name", ({ cart, brand }) => {
    const first = answer(cart, "3000");
    expect(first.valid).toBe(true);
    const anchor = anchorOf(first, bandsOf(brand))!;
    expect(anchor).not.toBeNull();
    const around = Math.round(first.price * (1 - first.margin! / 100));
    for (const [i, price] of prices(around, 400, cart.lines.length * 7919).entries()) {
      const delivery = i % 3 ? "0" : sen(i * 137);
      const server = answer(cart, price, delivery);
      const phone = repriced(anchor, { ...cart, price, delivery });
      if (!server.valid) {
        // Only the price can make an answered cart unanswerable: free KPI items that take all of it.
        expect(phone).toEqual({ ok: false, error: server.error });
        continue;
      }
      expect(phone?.ok, `RM ${price}`).toBe(true);
      if (!phone?.ok) continue;
      for (const key of PRICED_KEYS) expect(phone.data[key], `${key} at RM ${price}`).toEqual(server[key]);
    }
  });

  it("reads a cart back from the stand-in's answer as well as from a price typed", () => {
    for (const { cart, brand } of CARTS) {
      const anchor = anchorOf(answer(cart, STAND_IN_PRICE), bandsOf(brand))!;
      expect(anchor).not.toBeNull();
      for (const price of ["1999", "2500.50", "4685.27", "12000"]) {
        const phone = repriced(anchor, { ...cart, price, delivery: "80" });
        const server = answer(cart, price, "80");
        expect(phone?.ok && phone.data.margin).toBe(server.margin);
        expect(phone?.ok && phone.data.nextPrice).toBe(server.nextPrice);
      }
    }
  });

  it("says so when a margin shown at a threshold is still just below it, as the server does", () => {
    const { cart } = CARTS[0];
    const first = answer(cart, "3000");
    const anchor = anchorOf(first, AKEMI)!;
    // A sen under the next tier's price: the margin rounds to it without reaching it.
    const below = ((Math.round(first.nextPrice! * 100) - 1) / 100).toFixed(2);
    const server = answer(cart, below);
    expect(server.boundary).toBe(`Actual margin is just below ${first.nextThreshold}%. Add RM 0.01 to reach it.`);
    expect(repriced(anchor, { ...cart, price: below, delivery: "0" })).toMatchObject({ ok: true, data: { boundary: server.boundary, margin: server.margin } });
  });

  it("reaches the tier it names: at the price *Reach … at* gives, the margin clears it", () => {
    const { cart } = CARTS[1];
    const anchor = anchorOf(answer(cart, "4000"), AKEMI)!;
    let price = "4000.00";
    for (let step = 0; step < 3; step++) {
      const at = repriced(anchor, { ...cart, price, delivery: "0" });
      if (!at?.ok || at.data.nextPrice === null) break;
      const next = repriced(anchor, { ...cart, price: at.data.nextPrice.toFixed(2), delivery: "0" });
      expect(next?.ok && next.data.margin! + 1e-10 >= at.data.nextThreshold!).toBe(true);
      price = at.data.nextPrice.toFixed(2);
    }
  });
});

describe("what the phone trusts", () => {
  it("trusts only sums that give the server's own answer back — another brand's ladder gives a different one", () => {
    const { cart } = CARTS[0];
    // 34%: Akemi's Standard margin with Tier 1 next at 36%; Zanotti's ladder would call it Incentive Tier 1.
    const at34 = answer(cart, String(Math.ceil((1234.56 / 0.7 / 0.66) * 100) / 100));
    expect(at34.label).toBe("Standard margin range");
    expect(anchorOf(at34, AKEMI)).not.toBeNull();
    expect(anchorOf(at34, ZANOTTI)).toBeNull();
  });

  it("trusts no answer that is not a margin", () => {
    const refused: QuoteResult = { ...answer(CARTS[0].cart, "3000"), valid: false, margin: null, error: "Product cost is pending a Principal update." };
    expect(anchorOf(refused, AKEMI)).toBeNull();
    expect(anchorOf({ ...answer(CARTS[0].cart, "3000"), margin: 12.3456 }, AKEMI)).toBeNull();
  });

  it("reads a cart back exactly at the ends of the keypad: RM 0.01 and RM 999,999,999", () => {
    for (const price of ["0.01", "999999999.00"]) {
      const anchor = anchorOf(answer(CARTS[1].cart, price), AKEMI);
      expect(anchor, price).not.toBeNull();
      expect(repriced(anchor!, { ...CARTS[1].cart, price: "5000", delivery: "0" })).toMatchObject({ ok: true, data: { margin: answer(CARTS[1].cart, "5000").margin } });
    }
  });

  it("gives a price it cannot read no answer at all", () => {
    const anchor = anchorOf(answer(CARTS[0].cart, "3000"), AKEMI)!;
    for (const price of ["", "0", "0.00", "1.234", "abc"]) expect(repriced(anchor, { ...CARTS[0].cart, price, delivery: "0" })).toBeNull();
  });
});

describe("the cart's key and its stand-in", () => {
  it("is the cart alone: the price and the fee change nothing", () => {
    const { cart } = CARTS[3];
    expect(cartKey({ ...cart })).toBe(cartKey(standIn(cart)));
    expect(cartKey(cart)).not.toBe(cartKey({ ...cart, build: { ...cart.build, specials: [] } }));
    expect(standIn(cart)).toEqual({ ...cart, price: STAND_IN_PRICE, delivery: "0" });
  });
});
