import type { MemberBand, QuoteInput, QuoteResult } from "@/lib/member/types";
import { atPrice, cents, type CartSums, type PricedQuote } from "@/lib/member/quote-price";
import type { Outcome } from "../source";

/**
 * Step 2's margin as the digits go in (2026-10-14, the user: "按理来讲，它应该是
 * 毫秒级的 … 就像计算器一样"). The server still prices the cart — the phone is
 * handed nothing new for this (the user: "make sure they can't find it out
 * from 浏览器的开发工具"): its answer at one price is read back into the
 * cart's sums, and every other price is worked out from them by the server's
 * own arithmetic (`atPrice`). Whatever is read back is exactly what the
 * margin on the screen and its *Reach … at RM x* already tell anybody.
 */

/** The cart a quote prices — what its sums depend on; its price and fee do not change them. */
export type QuoteCart = Pick<QuoteInput, "schemeId" | "lines" | "build">;

export function cartKey(cart: QuoteCart): string {
  return JSON.stringify([cart.schemeId, cart.lines, cart.build ?? null]);
}

/**
 * The price a cart is asked at before one is typed, so that the first digit
 * already answers. Any price would do — the answer is read back into the
 * cart's sums — and one far above any cart keeps free KPI items from taking
 * all of it.
 */
export const STAND_IN_PRICE = "1000000.00";

export function standIn(cart: QuoteCart): QuoteInput {
  return { schemeId: cart.schemeId, lines: cart.lines, price: STAND_IN_PRICE, delivery: "0", build: cart.build };
}

/** A cart's sums, read back from an answer the server gave for it. */
export interface Anchor {
  sums: CartSums;
  /** The ladder the answer was judged on: the brand's, or none for a cart of riders alone. */
  ladder: readonly MemberBand[];
  /** The cart's own lists, which no price changes. */
  kpiItems: QuoteResult["kpiItems"];
  optionCharge: QuoteResult["optionCharge"];
  optionCharges: QuoteResult["optionCharges"];
  version: string;
}

const SAID = ["price", "delivery", "margin", "label", "tone", "multiplier", "nextPrice", "nextThreshold", "boundary"] as const;
/** Said by the live calculator; the design preview's leaves some out. */
const SAID_IF_SAID = ["kpiAmount", "addOnAmount", "optionCharge", "customerPays"] as const;

function gives(quote: PricedQuote, answer: QuoteResult): boolean {
  return SAID.every(k => quote[k] === answer[k]) && SAID_IF_SAID.every(k => answer[k] === undefined || quote[k] === answer[k]);
}

/**
 * The cart's sums, read back from the server's answer at its own price; `bands`
 * is the brand's ladder as the phone has it. Null — and the phone waits for
 * the server at every price, as before — unless they give that very answer
 * back, to the last digit: the same margin, band, next tier and its price.
 */
export function anchorOf(answer: QuoteResult, bands: readonly MemberBand[]): Anchor | null {
  if (!answer.valid || answer.margin === null || !Number.isFinite(answer.margin)) return null;
  const sen = (rm: number | undefined) => Math.round((rm ?? 0) * 100);
  const onTop = sen(answer.addOnAmount);
  const gift = sen(answer.kpiAmount) - onTop;
  const charge = sen(answer.optionCharge);
  const price = sen(answer.price), delivery = sen(answer.delivery);
  const main = price - gift;
  if (gift < 0 || charge < 0 || main <= 0) return null;
  const sums: CartSums = { cost: Math.round(main * (1 - answer.margin / 100)), gift, onTop, charge };
  // A cart of riders alone is judged on no ladder, and the server says so in its own words.
  const ladder = answer.label === "No brand rules" || (answer.label === "Below cost" && answer.nextThreshold === null) ? [] : bands;
  const again = atPrice(sums, ladder, price, delivery);
  if (!again.ok || !gives(again.quote, answer)) return null;
  return { sums, ladder, kpiItems: answer.kpiItems, optionCharge: answer.optionCharge, optionCharges: answer.optionCharges, version: answer.version };
}

/** The quote at the input's price and fee, from its cart's anchor: what the server would answer. Null for a price it cannot read. */
export function repriced(anchor: Anchor, input: QuoteInput): Outcome<QuoteResult> | null {
  const price = cents(input.price), delivery = cents(input.delivery || "0");
  if (price === null || price <= 0 || delivery === null) return null;
  const at = atPrice(anchor.sums, anchor.ladder, price, delivery);
  if (!at.ok) return { ok: false, error: at.error };
  return {
    ok: true,
    data: {
      valid: true,
      ...at.quote,
      kpiItems: anchor.kpiItems,
      // As the answer said it: the preview's calculator leaves it to the cart.
      optionCharge: anchor.optionCharge,
      optionCharges: anchor.optionCharges,
      version: anchor.version,
      // Not the server's: the customer's quote waits for its own answer.
      inputKey: "",
      suggestions: [],
    },
  };
}
