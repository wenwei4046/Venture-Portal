import { describe, expect, it } from "vitest";
import { calculateQuote } from "@/lib/member/calculator";
import type { MemberBand, MemberProduct, QuoteInput, QuoteResult } from "@/lib/member/types";
import type { Outcome } from "../source";
import {
  EMPTY_BOOK, NOT_REACHED, SETTLE_MS, SOON_MS, confirmedAnswer, nextAsk, recordAnswer, shownAnswer, type Ask, type Moment, type QuoteBook,
} from "./quote-book";
import { STAND_IN_PRICE, cartKey, type QuoteCart } from "./reprice";

// What step 2 asks the server, and when (2026-10-14): a cart once, as soon as it changes;
// the price on screen once the typing pauses; one question at a time, the newest.

const band = (key: string, kind: MemberBand["kind"], threshold: number, multiplier: number | null = null): MemberBand =>
  ({ brand: "AKEMI", key, kind, threshold, multiplier, amount: 0 });
const BANDS = [band("Incentive Tier 2", "incentive", 43), band("Incentive Tier 1", "incentive", 36), band("Standard margin", "reference", 33),
  band("Low margin", "reference", 30), band("Below margin Tier 1", "penalty", 27, 0.5), band("Below margin Tier 3", "penalty", 24, 0)];
const MATTRESS: MemberProduct = { id: "ak-q", code: "AK-Q", name: "Serene", brand: "AKEMI", category: "Mattress", size: "Queen", color: "",
  available: true, gift: false, kind: "MATTRESS", cost: 1920, version: "v1" };
const server = (input: QuoteInput): Outcome<QuoteResult> => {
  const r = calculateQuote(input, [MATTRESS], BANDS, { costDivisor: 0.64 });
  return r.valid ? { ok: true, data: r } : { ok: false, error: r.error! };
};

const CART: QuoteCart = { schemeId: "fair", lines: [{ productId: "ak-q", quantity: 1, gift: false }], build: undefined };
const TWO: QuoteCart = { ...CART, lines: [{ productId: "ak-q", quantity: 2, gift: false }] };
function moment(cart: QuoteCart | null, price: string, over: Partial<Moment> = {}): Moment {
  const input = cart && price ? { schemeId: cart.schemeId, lines: cart.lines, price, delivery: "0", build: cart.build } : null;
  return { cart, cartId: cart ? cartKey(cart) : "", input, inputKey: input ? JSON.stringify(input) : "", pricing: true, allowed: true, bands: BANDS, ...over };
}
/** Answers whatever is asked next, as the server would. */
function answerNext(book: QuoteBook, at: Moment): { book: QuoteBook; ask: Ask } {
  const ask = nextAsk(book, at)!;
  expect(ask).not.toBeNull();
  return { book: recordAnswer(book, ask, server(ask.input)), ask };
}

describe("what step 2 asks", () => {
  it("asks for a new cart at once, at a stand-in price when none is typed — the products page too", () => {
    const ask = nextAsk(EMPTY_BOOK, moment(CART, "", { pricing: false }))!;
    expect(ask).toMatchObject({ standIn: true, wait: SOON_MS, input: { price: STAND_IN_PRICE, delivery: "0" } });
  });

  it("asks at the price typed when there is one: one answer serves the cart and the quote", () => {
    expect(nextAsk(EMPTY_BOOK, moment(CART, "3000.00"))).toMatchObject({ standIn: false, wait: SOON_MS, input: { price: "3000.00" } });
  });

  it("asks nothing for a cart it has, until a price is typed and step 2 is on screen — then once the typing pauses", () => {
    const { book } = answerNext(EMPTY_BOOK, moment(CART, "", { pricing: false }));
    expect(nextAsk(book, moment(CART, "", { pricing: false }))).toBeNull();
    expect(nextAsk(book, moment(CART, "2999.00", { pricing: false }))).toBeNull();
    expect(nextAsk(book, moment(CART, "2999.00"))).toMatchObject({ standIn: false, wait: SETTLE_MS, input: { price: "2999.00" } });
  });

  it("asks nothing with no cart, nor where it may not ask (View as on the products page)", () => {
    expect(nextAsk(EMPTY_BOOK, moment(null, ""))).toBeNull();
    expect(nextAsk(EMPTY_BOOK, moment(CART, "3000.00", { allowed: false }))).toBeNull();
  });

  it("asks a cart's stand-in once, even when its answer cannot be read back", () => {
    const ask = nextAsk(EMPTY_BOOK, moment(CART, "", { bands: [] }))!;
    // Read back against no ladder, the answer's tiers cannot be given back: nothing is kept.
    const book = recordAnswer(EMPTY_BOOK, ask, server(ask.input));
    expect(book.anchors.size).toBe(0);
    expect(nextAsk(book, moment(CART, "", { bands: [] }))).toBeNull();
  });
});

describe("what step 2 shows", () => {
  it("works every price out at once once the cart is answered — the server's answer, digit for digit", () => {
    const { book } = answerNext(EMPTY_BOOK, moment(CART, ""));
    for (const price of ["2.00", "29.00", "299.00", "2999.00", "4685.27"]) {
      const at = moment(CART, price);
      const shown = shownAnswer(book, at);
      const own = server(at.input!);
      expect(shown.pending).toBe(false);
      expect(shown.result?.margin).toBe(own.ok && own.data.margin);
      expect(shown.result?.nextPrice).toBe(own.ok && own.data.nextPrice);
    }
  });

  it("waits — Calculating — only for a cart the server has not answered", () => {
    const { book } = answerNext(EMPTY_BOOK, moment(CART, ""));
    expect(shownAnswer(book, moment(TWO, "3000.00"))).toEqual({ result: null, error: null, pending: true });
    expect(shownAnswer(book, moment(CART, ""))).toEqual({ result: null, error: null, pending: false });
  });

  it("builds the customer's quote only from the server's own answer to the price on screen", () => {
    let { book } = answerNext(EMPTY_BOOK, moment(CART, ""));
    expect(confirmedAnswer(book, moment(CART, "3000.00").inputKey)).toBeNull();
    ({ book } = answerNext(book, moment(CART, "3000.00")));
    expect(confirmedAnswer(book, moment(CART, "3000.00").inputKey)?.customerText).toBeUndefined();
    expect(confirmedAnswer(book, moment(CART, "3000.00").inputKey)?.margin).toBe(shownAnswer(book, moment(CART, "3000.00")).result?.margin);
    expect(confirmedAnswer(book, moment(CART, "3100.00").inputKey)).toBeNull();
  });

  it("says why a cart cannot be priced, at any price, once the stand-in is refused", () => {
    const ask = nextAsk(EMPTY_BOOK, moment(CART, ""))!;
    const book = recordAnswer(EMPTY_BOOK, ask, { ok: false, error: "Product cost is pending a Principal update. Margin cannot be confirmed yet." });
    expect(shownAnswer(book, moment(CART, "3000.00"))).toMatchObject({ error: "Product cost is pending a Principal update. Margin cannot be confirmed yet.", pending: false });
    // Still asked at each price the typing settles on: a cost may be keyed meanwhile.
    expect(nextAsk(book, moment(CART, "3000.00"))).toMatchObject({ wait: SETTLE_MS });
    const fixed = recordAnswer(book, nextAsk(book, moment(CART, "3000.00"))!, server(moment(CART, "3000.00").input!));
    expect(fixed.refused.size).toBe(0);
    expect(shownAnswer(fixed, moment(CART, "3500.00")).result?.margin).toBeCloseTo(((3500 - 3000) / 3500) * 100, 10);
  });

  it("drops what it read when the server refuses the price on screen, and asks the cart again", () => {
    let { book } = answerNext(EMPTY_BOOK, moment(CART, ""));
    const ask = nextAsk(book, moment(CART, "3000.00"))!;
    book = recordAnswer(book, ask, { ok: false, error: "A product is unavailable or its quantity is invalid. Please select it again." });
    expect(book.anchors.size).toBe(0);
    expect(shownAnswer(book, moment(CART, "3000.00")).error).toMatch(/unavailable/);
    expect(shownAnswer(book, moment(CART, "3100.00")).pending).toBe(true);
    expect(nextAsk(book, moment(CART, "3000.00"))).toMatchObject({ standIn: true });
  });

  it("keeps working the price out when the server could not be reached, and says so only without it", () => {
    let { book } = answerNext(EMPTY_BOOK, moment(CART, ""));
    const ask = nextAsk(book, moment(CART, "3000.00"))!;
    book = recordAnswer(book, ask, { ok: false, error: NOT_REACHED }, true);
    expect(shownAnswer(book, moment(CART, "3000.00")).result?.margin).toBeCloseTo(((3000 - 3000) / 3000) * 100, 10);
    expect(confirmedAnswer(book, moment(CART, "3000.00").inputKey)).toBeNull();
    // Not asked again until the price changes.
    expect(nextAsk(book, moment(CART, "3000.00"))).toBeNull();
    const cold = recordAnswer(EMPTY_BOOK, nextAsk(EMPTY_BOOK, moment(CART, "3000.00"))!, { ok: false, error: NOT_REACHED }, true);
    expect(shownAnswer(cold, moment(CART, "3000.00"))).toMatchObject({ error: NOT_REACHED, pending: false });
  });

  it("remembers a few carts back: a step of + and − is worked out without asking", () => {
    let book = EMPTY_BOOK;
    ({ book } = answerNext(book, moment(CART, "")));
    ({ book } = answerNext(book, moment(TWO, "")));
    expect(nextAsk(book, moment(CART, "", { pricing: false }))).toBeNull();
    expect(shownAnswer(book, moment(CART, "3000.00")).pending).toBe(false);
    for (let qty = 3; qty <= 40; qty++) ({ book } = answerNext(book, moment({ ...CART, lines: [{ productId: "ak-q", quantity: qty, gift: false }] }, "")));
    expect(book.anchors.size).toBe(24);
    expect(book.anchors.has(cartKey(CART))).toBe(false);
  });
});
