import type { MemberBand, QuoteBuild, QuoteInput, QuoteLine, QuoteResult } from "@/lib/member/types";
import { bedframeKey } from "@/lib/member/catalog";
import { buildLines } from "@/lib/member/build";
import { brandLadder, pctText, rowFor, type Tone } from "../insight/ladder";
import { rm, rm2 } from "../format";
import { customerLines, type CartLine, type SofaBuild } from "./quote-model";
import type { CustomerQuote } from "./QuoteSheets";

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
  /** KPI items on top of the price: `2 KPI items` · `+ RM 500`. */
  kpi: { label: string; total: string } | null;
  /** The bed frames' divan, leg, gap and total height charged on top (2026-10-05): `+ RM 120`. */
  options: { total: string } | null;
  /** Customer pays: the price, what rides on top of it, and the fee — once anything does. */
  pay: string | null;
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
 * What the server is asked: the cart by SKU — a bed frame by SKU AND its own
 * build (2026-10-05) — and the selling price as typed. KPI items and the bed
 * frames' option charges ride on top of it, out of the margin; the server
 * works both out itself. The sofas' one build (seat height, tier, leg height,
 * specials) goes only with a sofa in the cart.
 */
export function quoteInput(schemeId: string, cart: CartLine[], price: string, fee: string, build: SofaBuild): QuoteInput | null {
  const typed = Number(price);
  if (!cart.length || !price || !Number.isFinite(typed) || typed <= 0) return null;
  const lines = new Map<string, QuoteLine>();
  for (const line of cart) {
    const key = JSON.stringify([line.productId, line.bedframe ? bedframeKey(line.bedframe) : ""]);
    const held = lines.get(key);
    lines.set(key, held
      ? { ...held, quantity: held.quantity + line.qty }
      : { productId: line.productId, quantity: line.qty, gift: false, ...(line.bedframe ? { bedframe: line.bedframe } : {}) });
  }
  return {
    schemeId,
    lines: [...lines.values()].map(l => ({ ...l, quantity: Math.min(l.quantity, 100) })),
    price: typed.toFixed(2),
    delivery: fee && Number(fee) > 0 ? Number(fee).toFixed(2) : "0",
    build: cart.some(l => l.kind === "sofa") ? sofaQuoteBuild(build) : undefined,
  };
}

/**
 * What the customer is shown once the calculator confirmed the price on screen:
 * the lines (a bed frame with its own build), the sofas' one build, and a total
 * that is step 2's *Customer pays* — the KPI items bought and the bed frames'
 * option charges ride on top of the price, as the shared text says.
 */
export function customerQuote(cart: CartLine[], result: QuoteResult, build: QuoteBuild | undefined): CustomerQuote {
  const addOns = result.addOnAmount ?? 0;
  const options = result.optionCharge ?? 0;
  return {
    lines: customerLines(cart),
    build: buildLines(build, { sofaGrid: true, sofa: cart.some(l => l.kind === "sofa"), bedframe: false }),
    price: result.price,
    addOns,
    options,
    fee: result.delivery,
    total: result.customerPays ?? result.price + addOns + options + result.delivery,
    text: result.customerText ?? "",
  };
}

/** The sofas' build as the server reads it; undefined = nothing chosen. */
function sofaQuoteBuild(build: SofaBuild): QuoteBuild | undefined {
  const out: QuoteBuild = {};
  if (build.height && build.tier) { out.height = build.height; out.tier = build.tier; }
  if (build.leg) out.leg = build.leg;
  if (build.specials.length) out.specials = [...build.specials];
  return Object.keys(out).length ? out : undefined;
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
  /** What the cart's bed frames' options are charged, RM. */
  options?: number;
  fee?: string;
}): CalcVM {
  const { price, items, bands, result, error } = args;
  const typed = Number(price) || 0;
  const kpiAmount = args.kpi && args.kpi.qty > 0 ? args.kpi.amount : 0;
  const options = args.options && args.options > 0 ? args.options : 0;
  const base = {
    priceText: priceText(price),
    hint: items ? "Next: enter your selling price" : "Choose a model to continue",
    kpi: args.kpi && args.kpi.qty > 0 ? { label: `${args.kpi.qty} KPI item${args.kpi.qty > 1 ? "s" : ""}`, total: rm(args.kpi.amount) } : null,
    options: options > 0 ? { total: rm(options) } : null,
    pay: kpiAmount + options > 0 ? rm(typed + kpiAmount + options + (Number(args.fee) || 0)) : null,
  };
  if (!items) return { ...base, ...NONE, tierLabel: "Add products", note: null };
  if (!(typed > 0)) return { ...base, ...NONE, tierLabel: "Enter a price", note: null };
  if (error) return { ...base, ...NONE, tierLabel: /cost/i.test(error) ? "Cost pending" : "Not calculated", note: error };
  if (!result || result.margin === null) return { ...base, ...NONE, tierLabel: "Enter a price", note: null };
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
    note: null,
  };
}
