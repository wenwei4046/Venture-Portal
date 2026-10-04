import type { MemberBand, QuoteInput, QuoteResult } from "@/lib/member/types";
import { brandLadder, pctText, rowFor, type Tone } from "../insight/ladder";
import { rm, rm2 } from "../format";
import type { CartLine } from "./quote-model";

/**
 * Step 2 — Price & margin (RevenueApp.dc.html 328–382, `priceText` …
 * `useNext`). The margin and the price that reaches the next tier come from
 * the calculator on the server (a cost never reaches the phone); which row of
 * the brand's ladder that margin falls in is read here, from the same bands
 * Insight draws.
 */

export interface CalcVM {
  priceText: string;
  hint: string;
  marginText: string;
  tierLabel: string;
  tone: Tone;
  penalty: string | null;
  next: { tier: string; price: string; value: number } | null;
  /** KPI items on top of the price: `2 KPI items` · `+ RM 500` · Customer pays. */
  kpi: { label: string; total: string; pay: string } | null;
  /** Why there is no margin, when the calculator said so. */
  note: string | null;
}

/** The keypad (`press`): two decimals at most, eight digits at most. */
export function press(price: string, key: string): string {
  if (key === "del") return price.slice(0, -1);
  if (key === ".") return price.includes(".") ? price : (price || "0") + ".";
  if (/\.\d\d$/.test(price) || price.replace(".", "").length >= 8) return price;
  return price === "0" ? key : price + key;
}

/** `5,480` / `5,480.5` — the price as it is being typed. */
export function priceText(price: string): string {
  const [whole, decimals] = (price || "0").split(".");
  return Number(whole || 0).toLocaleString("en-MY") + (decimals !== undefined ? "." + decimals : "");
}

/**
 * What the server is asked: the cart by SKU and the price as typed. (KPI
 * items would ride on top of it; no sub-department pays KPI today, so the
 * live catalogue offers none.)
 */
export function quoteInput(schemeId: string, cart: CartLine[], price: string, fee: string, build: { height: string | null; tier: string | null }): QuoteInput | null {
  const typed = Number(price);
  if (!cart.length || !price || !Number.isFinite(typed) || typed <= 0) return null;
  const qty = new Map<string, number>();
  for (const line of cart) qty.set(line.productId, (qty.get(line.productId) ?? 0) + line.qty);
  const sofa = cart.some(l => l.kind === "sofa");
  return {
    schemeId,
    lines: [...qty.entries()].map(([productId, quantity]) => ({ productId, quantity: Math.min(quantity, 100), gift: false })),
    price: typed.toFixed(2),
    delivery: fee && Number(fee) > 0 ? Number(fee).toFixed(2) : "0",
    build: sofa && build.height && build.tier ? { height: build.height, tier: build.tier } : undefined,
  };
}

const NONE = { marginText: "—", tone: "none" as Tone, penalty: null, next: null };

export function calcVM(args: {
  price: string;
  items: number;
  bands: MemberBand[];
  result: QuoteResult | null;
  error: string | null;
  /** The cart's KPI items: count and amount, RM. */
  kpi?: { qty: number; amount: number };
  fee?: string;
}): CalcVM {
  const { price, items, bands, result, error } = args;
  const typed = Number(price) || 0;
  const base = { priceText: priceText(price), hint: items ? "Next: enter your selling price" : "Choose a model to continue" };
  const kpi = args.kpi && args.kpi.qty > 0
    ? { label: `${args.kpi.qty} KPI item${args.kpi.qty > 1 ? "s" : ""}`, total: rm(args.kpi.amount), pay: rm(typed + args.kpi.amount + (Number(args.fee) || 0)) }
    : null;
  if (!items) return { ...base, ...NONE, tierLabel: "Add products", kpi, note: null };
  if (!(typed > 0)) return { ...base, ...NONE, tierLabel: "Enter a price", kpi, note: null };
  if (error) return { ...base, ...NONE, tierLabel: /cost/i.test(error) ? "Cost pending" : "Not calculated", kpi, note: error };
  if (!result || result.margin === null) return { ...base, ...NONE, tierLabel: "Enter a price", kpi, note: null };
  const ladder = brandLadder(bands);
  const row = rowFor(result.margin, ladder);
  const nextBand = result.nextThreshold !== null ? ladder.incentives.find(i => Math.abs(i.threshold - result.nextThreshold!) < 1e-9) : undefined;
  return {
    ...base,
    marginText: result.margin.toFixed(1) + "%",
    tierLabel: row?.label ?? result.label,
    tone: row?.tone ?? (result.margin < 0 ? "bad" : "neutral"),
    penalty: row?.kind === "penalty" ? row.effect : null,
    next: result.nextPrice !== null && result.nextThreshold !== null
      ? { tier: `${nextBand?.label ?? "the next tier"} (${pctText(result.nextThreshold)}%)`, price: rm2(result.nextPrice), value: result.nextPrice }
      : null,
    kpi,
    note: null,
  };
}

/** `Margin uses the Fair team cost basis (cost ÷ 0.7).` */
export function costBasisNote(subName: string, divisor: number | null): string {
  const fees = "Fees such as delivery or disposal show on the customer quote and are excluded from margin.";
  if (divisor === null) return fees;
  return `${fees} Margin uses the ${subName} team cost basis (${divisor === 1 ? "cost as keyed" : `cost ÷ ${divisor}`}).`;
}
