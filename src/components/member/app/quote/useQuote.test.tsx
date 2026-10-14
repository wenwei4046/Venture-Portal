import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateQuote } from "@/lib/member/calculator";
import type { MemberBand, MemberProduct, QuoteInput, QuoteResult } from "@/lib/member/types";
import type { Outcome } from "../source";
import { SETTLE_MS, SOON_MS } from "./quote-book";
import { EMPTY_MEMORY, NO_SOFA_CHOICES, type CartLine, type QCatalog } from "./quote-model";
import { STAND_IN_PRICE } from "./reprice";
import { useQuote, type UseQuoteArgs } from "./useQuote";

// 2026-10-14 (the user, on step 2: "我一输完它就跳出来 … 就像计算器一样"): the margin follows each
// digit at once — the server is asked about the cart once, never about each digit.

const band = (key: string, kind: MemberBand["kind"], threshold: number, multiplier: number | null = null): MemberBand =>
  ({ brand: "AKEMI", key, kind, threshold, multiplier, amount: 0 });
const BANDS = [band("Incentive Tier 2", "incentive", 43), band("Incentive Tier 1", "incentive", 36), band("Standard margin", "reference", 33),
  band("Low margin", "reference", 30), band("Below margin Tier 1", "penalty", 27, 0.5), band("Below margin Tier 3", "penalty", 24, 0, )];
const MATTRESS: MemberProduct = { id: "ak-q", code: "AK-Q", name: "Serene", brand: "AKEMI", category: "Mattress", size: "Queen", color: "",
  available: true, gift: false, kind: "MATTRESS", cost: 2099.99, version: "v1" };
const server = (input: QuoteInput): Outcome<QuoteResult> => {
  const r = calculateQuote(input, [MATTRESS], BANDS, { costDivisor: 0.7 });
  return r.valid ? { ok: true, data: { ...r, customerText: "quote" } } : { ok: false, error: r.error! };
};
const marginAt = (price: string) => {
  const r = server({ schemeId: "fair", lines: [{ productId: "ak-q", quantity: 1, gift: false }], price, delivery: "0" });
  return r.ok ? `${r.data.margin!.toFixed(1)}%` : null;
};

const CATALOG: QCatalog = {
  brand: "AKEMI", name: "Akemi", sofa: false, frames: [], accs: [], kpis: [], accSummary: "",
  models: [{ key: "serene", name: "Serene", desc: "", sizes: { Q: "ak-q" }, modules: [], choices: NO_SOFA_CHOICES }],
};
const LINE: CartLine = { id: "m-serene-Q", kind: "mattress", key: "serene", name: "Serene", size: "Queen", qty: 1, productId: "ak-q" };

function args(calc: UseQuoteArgs["calc"], over: Partial<UseQuoteArgs> = {}): UseQuoteArgs {
  return {
    catalogs: { AKEMI: CATALOG }, fallbackBrand: "AKEMI", schemeId: "fair", bands: BANDS, storeKey: null, readOnly: false, calc, pricing: true,
    initial: { brand: "AKEMI", cart: [LINE], price: "", memory: EMPTY_MEMORY, sheet: null },
    ...over,
  };
}
const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const prices = (calc: ReturnType<typeof vi.fn>) => calc.mock.calls.map(([input]) => (input as QuoteInput).price);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("step 2's margin", () => {
  it("asks about the cart once, then answers every digit at once — no question per digit", async () => {
    const calc = vi.fn(async (input: QuoteInput) => server(input));
    const { result } = renderHook(() => useQuote(args(calc)));
    await wait(SOON_MS);
    expect(prices(calc)).toEqual([STAND_IN_PRICE]);
    for (const [key, typed] of [["2", "2"], ["9", "29"], ["9", "299"], ["9", "2999"]] as const) {
      act(() => result.current.press(key));
      // Before any timer or answer: the margin is already the server's for this price.
      expect(result.current.vm.marginText).toBe(marginAt(`${typed}.00`));
      expect(result.current.vm.tierLabel).not.toBe("Calculating");
    }
    expect(calc).toHaveBeenCalledTimes(1);
    // Once the typing pauses, the price on screen is asked once, for the customer's quote.
    expect(result.current.confirmed).toBeNull();
    await wait(SETTLE_MS);
    expect(prices(calc)).toEqual([STAND_IN_PRICE, "2999.00"]);
    expect(result.current.confirmed?.customerText).toBe("quote");
  });

  it("tells *Reach … at RM x* at once, and *Use price* reaches it", async () => {
    const calc = vi.fn(async (input: QuoteInput) => server(input));
    const { result } = renderHook(() => useQuote(args(calc, { initial: { ...args(calc).initial!, price: "3000" } })));
    await wait(SOON_MS);
    const next = result.current.vm.next!;
    expect(next.tier).toBe("Incentive Tier 1 (36%)");
    act(() => result.current.applyNext());
    expect(result.current.price).toBe(next.value.toFixed(2));
    expect(result.current.vm.tierLabel).toBe("Incentive Tier 1");
  });

  it("asks one question at a time, and only the newest: four digits typed during an answer are one question after it", async () => {
    const pending: ((r: Outcome<QuoteResult>) => void)[] = [];
    const calc = vi.fn((input: QuoteInput) => new Promise<Outcome<QuoteResult>>(resolve => pending.push(() => resolve(server(input)))));
    const { result } = renderHook(() => useQuote(args(calc)));
    await wait(SOON_MS);
    expect(prices(calc)).toEqual([STAND_IN_PRICE]);
    for (const key of ["2", "9", "9", "9"]) act(() => result.current.press(key));
    // The cart's answer is not back yet: the margin waits for it, and nothing else is asked meanwhile.
    expect(result.current.vm.tierLabel).toBe("Calculating");
    await wait(5_000);
    expect(calc).toHaveBeenCalledTimes(1);
    await act(async () => { pending.shift()!({ ok: true } as never); await Promise.resolve(); });
    expect(result.current.vm.marginText).toBe(marginAt("2999.00"));
    await wait(SETTLE_MS);
    expect(prices(calc)).toEqual([STAND_IN_PRICE, "2999.00"]);
  });

  it("asks about a cart as it is built, on the products page, so step 2 opens already answering", async () => {
    const calc = vi.fn(async (input: QuoteInput) => server(input));
    const { result } = renderHook(() => useQuote(args(calc, { pricing: false, initial: { ...args(calc).initial!, cart: [] } })));
    await wait(1_000);
    expect(calc).not.toHaveBeenCalled();
    act(() => result.current.openModel("serene"));
    act(() => result.current.addSheet());
    await wait(SOON_MS);
    expect(prices(calc)).toEqual([STAND_IN_PRICE]);
    act(() => result.current.press("5"));
    expect(result.current.vm.marginText).toBe(marginAt("5.00"));
  });

  it("asks nothing for View as on the products page", async () => {
    const calc = vi.fn(async (input: QuoteInput) => server(input));
    renderHook(() => useQuote(args(calc, { readOnly: true, pricing: false })));
    await wait(1_000);
    expect(calc).not.toHaveBeenCalled();
  });

  it("is not left waiting when the calculator cannot be reached, and asks again at the next price", async () => {
    let reachable = false;
    const calc = vi.fn((input: QuoteInput) => {
      if (!reachable) throw new Error("Failed to fetch");
      return Promise.resolve(server(input));
    });
    const { result } = renderHook(() => useQuote(args(calc, { initial: { ...args(calc).initial!, price: "3000" } })));
    await wait(SOON_MS);
    expect(result.current.vm.note).toMatch(/could not be reached/);
    reachable = true;
    act(() => result.current.press("0"));
    await wait(SOON_MS);
    expect(prices(calc)).toEqual(["3000.00", "30000.00"]);
    expect(result.current.vm.marginText).toBe(marginAt("30000.00"));
  });

  it("says the server's reason when it refuses the cart, at every price", async () => {
    const calc = vi.fn(async (): Promise<Outcome<QuoteResult>> => ({ ok: false, error: "Product cost is pending a Principal update. Margin cannot be confirmed yet." }));
    const { result } = renderHook(() => useQuote(args(calc)));
    await wait(SOON_MS);
    act(() => result.current.press("4"));
    expect(result.current.vm).toMatchObject({ tierLabel: "Cost pending", note: "Product cost is pending a Principal update. Margin cannot be confirmed yet." });
  });
});
