import type { MemberBand, QuoteResult } from "./types";

/**
 * A quote at one selling price, worked out ONE way (2026-10-14). The server's
 * calculator (`calculateQuote`) works out what a cart comes to and asks this
 * for the price keyed; the Revenue app's keypad asks it again for every price
 * typed after, from the sums read back out of the server's own answer
 * (`components/member/app/quote/reprice.ts`) — so the margin answers as the
 * digits go in, and the two can never disagree. Nothing here knows what a SKU
 * costs or how that is made up: it is handed one total, in sen.
 */

/** Decimal money enters the engine as integer cents; tier comparisons use unrounded ratios. */
export function cents(raw: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw.trim())) return null;
  const [whole, fraction = ""] = raw.trim().split(".");
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(value) && value <= 99999999900 ? value : null;
}

export function bandFor(margin: number | null, bands: readonly MemberBand[]) {
  if (margin === null)
    return { label: "Cost pending", tone: "neutral" as const, multiplier: 1 };
  const penalty = bands
    .filter((b) => b.kind === "penalty" && margin <= b.threshold + 1e-10)
    .sort((a, b) => (a.multiplier ?? 1) - (b.multiplier ?? 1))[0];
  const cleared = bands
    .filter((b) => b.kind !== "penalty" && margin + 1e-10 >= b.threshold)
    .sort((a, b) => b.threshold - a.threshold)[0];
  if (penalty)
    return {
      label: `Commission ×${penalty.multiplier ?? 1}`,
      tone: "danger" as const,
      multiplier: penalty.multiplier ?? 1,
    };
  if (margin < 0)
    return { label: "Below cost", tone: "danger" as const, multiplier: 1 };
  return {
    label: cleared
      ? cleared.kind === "incentive"
        ? `${cleared.key} threshold`
        : `${cleared.key} range`
      : "Below reference range",
    tone:
      cleared?.kind === "incentive" ? ("good" as const) : ("warning" as const),
    multiplier: 1,
  };
}

/** What a cart comes to, in sen, whatever its selling price. */
export interface CartSums {
  /** What the margin is measured against. */
  cost: number;
  /** The KPI items given free: off the price, so out of the margin. */
  gift: number;
  /** The KPI items the customer buys: on top of the price. */
  onTop: number;
  /** What the options are charged: on top of the price, out of the margin. */
  charge: number;
}

/** What a selling price decides: the answer, but for the cart's own lists. */
export type PricedQuote = Pick<
  QuoteResult,
  | "price"
  | "delivery"
  | "label"
  | "tone"
  | "multiplier"
  | "nextPrice"
  | "nextThreshold"
  | "boundary"
  | "kpiAmount"
  | "addOnAmount"
  | "optionCharge"
  | "customerPays"
> & { margin: number };

/**
 * The cart at `price`, with `delivery` on top (both in sen), judged on
 * `bands` — its brand's ladder; none for a cart of riders alone (bed frames
 * and accessories carry no brand). Margin = (price − free KPI items − cost) ÷
 * (price − free KPI items); the price that reaches a threshold t is the free
 * KPI items + cost ÷ (1 − t), up to the sen — never cost × (1 + t) (user
 * 2026-09-12). The customer pays the price, the KPI items bought, the option
 * charges and the additional charges.
 */
export function atPrice(
  sums: CartSums,
  bands: readonly MemberBand[],
  price: number,
  delivery: number,
): { ok: true; quote: PricedQuote } | { ok: false; error: string } {
  const main = price - sums.gift;
  if (main <= 0)
    return {
      ok: false,
      error: `The free KPI items (RM ${(sums.gift / 100).toFixed(2)}) take the whole price. Raise it to see a margin.`,
    };
  const margin = ((main - sums.cost) / main) * 100;
  const band = bands.length
    ? bandFor(margin, bands)
    : {
        label: margin < 0 ? "Below cost" : "No brand rules",
        tone: margin < 0 ? ("danger" as const) : ("neutral" as const),
        multiplier: 1,
      };
  const next = bands
    .filter((b) => b.kind === "incentive" && b.threshold > margin + 1e-10)
    .sort((a, b) => a.threshold - b.threshold)[0];
  const reach = next
    ? sums.gift + Math.ceil(sums.cost / (1 - next.threshold / 100) - 1e-7)
    : null;
  return {
    ok: true,
    quote: {
      price: price / 100,
      delivery: delivery / 100,
      margin,
      ...band,
      nextPrice: reach === null ? null : reach / 100,
      nextThreshold: next?.threshold ?? null,
      // A displayed percentage may round up to a threshold while still being below it.
      boundary:
        next && reach !== null && Number(margin.toFixed(2)) >= next.threshold
          ? `Actual margin is just below ${next.threshold}%. Add RM ${((reach - price) / 100).toFixed(2)} to reach it.`
          : null,
      kpiAmount: (sums.gift + sums.onTop) / 100,
      addOnAmount: sums.onTop / 100,
      optionCharge: sums.charge / 100,
      customerPays: (price + sums.onTop + sums.charge + delivery) / 100,
    },
  };
}
