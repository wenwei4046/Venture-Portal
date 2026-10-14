import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MemberBand, QuoteResult } from "@/lib/member/types";
import { calcVM, type CalcVM } from "./calc-model";
import QuoteCalc from "./QuoteCalc";
import type { CartLine } from "./quote-model";

// 2026-10-15 (the user: once a price was typed the next-tier line and a two-line tier name pushed the
// keypad down, and the thumb hit the wrong key): the card is drawn at its tallest from the start — every
// changing part shares its place with an invisible copy of its tallest state, in every state.

const band = (key: string, kind: MemberBand["kind"], threshold: number, multiplier: number | null = null): MemberBand =>
  ({ brand: "AKEMI", key, kind, threshold, multiplier, amount: 0 });
const BANDS = [band("Incentive Tier 2", "incentive", 43), band("Incentive Tier 1", "incentive", 36), band("Standard margin", "reference", 33),
  band("Low margin", "reference", 30), band("Below margin Tier 1", "penalty", 27, 0.5), band("Below margin Tier 3", "penalty", 24, 0)];
const result = (margin: number, next: [number, number] | null = null): QuoteResult => ({
  valid: true, price: 0, delivery: 0, margin, label: "", tone: "neutral", multiplier: 1,
  nextPrice: next ? next[1] : null, nextThreshold: next ? next[0] : null, boundary: null, version: "", inputKey: "", suggestions: [],
});
const CART: CartLine[] = [{ id: "a", kind: "mattress", key: "apex", name: "APEX", size: "Queen", qty: 1, productId: "p" }];

const STATES: [string, CalcVM][] = [
  ["no price yet", calcVM({ price: "", items: 1, bands: BANDS, result: null, error: null, first: { price: 5803.58, threshold: 36 } })],
  ["a penalty", calcVM({ price: "2888", items: 1, bands: BANDS, result: result(-28.6, [36, 5803.58]), error: null })],
  ["the top tier reached", calcVM({ price: "9000", items: 1, bands: BANDS, result: result(47.2), error: null })],
  ["a cart being priced", calcVM({ price: "2888", items: 1, bands: BANDS, result: null, error: null, pending: true })],
  ["a refusal", calcVM({ price: "", items: 1, bands: BANDS, result: null, error: null, refused: "Product cost is pending a Principal update." })],
];

function draw(vm: CalcVM) {
  return render(<QuoteCalc vm={vm} brandName="Akemi" cart={CART} fee="" onPress={vi.fn()} onNext={vi.fn()} onBump={vi.fn()} onFee={vi.fn()} onProducts={vi.fn()} />);
}

describe("step 2's card keeps one size", () => {
  it.each(STATES)("draws the next-tier line and the room for the tallest state with %s", (_name, vm) => {
    const { container } = draw(vm);
    const rows = container.querySelectorAll('[class*="nextRow"]');
    expect(rows).toHaveLength(1);
    const rooms = [...container.querySelectorAll('[aria-hidden="true"]')].map(el => el.textContent);
    expect(rooms).toContain("Reach Incentive Tier 1 (36%) at RM 999,999.99Use price");
    expect(rooms.some(text => text?.includes("Below margin Tier 1") && text.includes("Commission × 0.5"))).toBe(true);
  });

  it("says what each state says on the line", () => {
    const text = (vm: CalcVM) => draw(vm).container.querySelector('[class*="nextRow"] > div > div:not([aria-hidden])')?.textContent ?? "";
    expect(text(STATES[0][1])).toBe("Reach Incentive Tier 1 (36%) at RM 5,803.58Use price");
    expect(text(STATES[1][1])).toBe("Reach Incentive Tier 1 (36%) at RM 5,803.58Use price");
    expect(text(STATES[2][1])).toBe("Incentive Tier 2 (43%) reached");
    expect(text(STATES[3][1])).toBe("");
    expect(text(STATES[4][1])).toBe("Product cost is pending a Principal update.");
  });

  it("offers one Use price, the real one", () => {
    const { getAllByRole } = draw(STATES[0][1]);
    expect(getAllByRole("button", { name: "Use price" })).toHaveLength(1);
  });
});
