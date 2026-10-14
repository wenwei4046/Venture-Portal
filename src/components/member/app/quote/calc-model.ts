import type { MemberBand, QuoteBuild, QuoteInput, QuoteLine, QuoteResult } from "@/lib/member/types";
import { bedframeKey } from "@/lib/member/catalog";
import { buildLines } from "@/lib/member/build";
import { brandLadder, pctText, rowFor, type Tone } from "../insight/ladder";
import { rm, rm2 } from "../format";
import { customerLines, type CartLine, type SofaBuild } from "./quote-model";
import type { QuoteCart } from "./reprice";
import type { CustomerQuote } from "./QuoteSheets";

/**
 * Step 2 — Price & margin (RevenueApp.dc.html 328–382, `priceText` …
 * `useNext`). The margin and the price that reaches the next tier are the
 * calculator's on the server (a cost never reaches the phone), worked out on
 * the phone for each price typed after its answer (2026-10-14, `reprice.ts`);
 * which row of the brand's ladder that margin falls in is read here, from the
 * same bands Insight draws.
 */

export interface CalcVM {
  priceText: string;
  hint: string;
  marginText: string;
  tierLabel: string;
  tone: Tone;
  penalty: string | null;
  /** The next incentive and the price that reaches it — the first one already before a price is typed. */
  next: { tier: string; price: string; value: number } | null;
  /** The top incentive the price has reached, when none is left above it: `Incentive Tier 2 (43%)`. */
  reached: string | null;
  /**
   * Everything the card's changing parts can say — every tier name the chip shows, every penalty line,
   * every next tier at the widest price — made room for from the start, so no price typed moves the
   * keypad under the member's thumb (2026-10-15). Every one, not the longest: "Tier 3" can wrap where
   * "Tier 1" of the same length does not (384px wide, found on production).
   */
  room: { tiers: string[]; penalties: string[]; reaches: string[]; price: string };
  /** KPI items on top of the price: `2 KPI items` · `+ RM 500`. */
  kpi: { label: string; total: string } | null;
  /** The options charged on top (2026-10-05; every option since 2026-10-06): `+ RM 120`. */
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
 * What the server is asked about: the cart by SKU — a bed frame by SKU AND its
 * own build (2026-10-05). The sofas' one build (seat height, tier, leg height,
 * specials) goes only with a sofa in the cart.
 */
export function quoteCart(schemeId: string, cart: CartLine[], build: SofaBuild): QuoteCart | null {
  if (!cart.length) return null;
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
    build: cart.some(l => l.kind === "sofa") ? sofaQuoteBuild(build) : undefined,
  };
}

/**
 * The cart and the selling price as typed. KPI items and the option charges
 * ride on top of it, out of the margin; the server works both out itself.
 */
export function quoteInput(schemeId: string, cart: CartLine[], price: string, fee: string, build: SofaBuild): QuoteInput | null {
  const typed = Number(price);
  const asked = quoteCart(schemeId, cart, build);
  if (!asked || !price || !Number.isFinite(typed) || typed <= 0) return null;
  return {
    schemeId: asked.schemeId,
    lines: asked.lines,
    price: typed.toFixed(2),
    delivery: fee && Number(fee) > 0 ? Number(fee).toFixed(2) : "0",
    build: asked.build,
  };
}

/**
 * What the customer is shown once the calculator confirmed the price on screen:
 * the lines (a bed frame with its own build), the sofas' one build, and a total
 * that is step 2's *Customer pays* — the KPI items bought and the option
 * charges ride on top of the price, as the shared text says.
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

const NONE = { marginText: "—", tone: "none" as Tone, penalty: null, next: null, reached: null };

/** The labels the chip shows when no row of the ladder does. */
const STATE_LABELS = ["Add products", "Enter a price", "Calculating", "Cost pending", "Not calculated", "No brand rules", "Below cost"];
const each = (texts: string[]) => [...new Set(texts)];
/** The widest price a next-tier line is drawn for. */
const WIDE_PRICE = 999999.99;

export function calcVM(args: {
  price: string;
  items: number;
  bands: MemberBand[];
  result: QuoteResult | null;
  error: string | null;
  /** The cart has just changed and the server has not priced it yet. */
  pending?: boolean;
  /** Before a price is typed: the first incentive and the price that reaches it, for the cart. */
  first?: { price: number; threshold: number } | null;
  /** The cart's own refusal, whatever the price — said before one is typed. */
  refused?: string | null;
  /** The cart's KPI items: count and amount, RM. */
  kpi?: { qty: number; amount: number };
  /** What the cart's options are charged, RM. */
  options?: number;
  fee?: string;
}): CalcVM {
  const { price, items, bands, result, error } = args;
  const typed = Number(price) || 0;
  const kpiAmount = args.kpi && args.kpi.qty > 0 ? args.kpi.amount : 0;
  const options = args.options && args.options > 0 ? args.options : 0;
  const ladder = brandLadder(bands);
  const nextOf = (threshold: number, value: number) => {
    const band = ladder.incentives.find(i => Math.abs(i.threshold - threshold) < 1e-9);
    return { tier: `${band?.label ?? "the next tier"} (${pctText(threshold)}%)`, price: rm2(value), value };
  };
  const top = ladder.incentives[ladder.incentives.length - 1];
  const reaches = ladder.incentives.map(i => `${i.label} (${pctText(i.threshold)}%)`);
  const base = {
    priceText: priceText(price),
    hint: items ? "Next: enter your selling price" : "Choose a model to continue",
    kpi: args.kpi && args.kpi.qty > 0 ? { label: `${args.kpi.qty} KPI item${args.kpi.qty > 1 ? "s" : ""}`, total: rm(args.kpi.amount) } : null,
    options: options > 0 ? { total: rm(options) } : null,
    pay: kpiAmount + options > 0 ? rm(typed + kpiAmount + options + (Number(args.fee) || 0)) : null,
    room: {
      tiers: each([...ladder.rows.map(r => r.label), ...STATE_LABELS]),
      penalties: each(ladder.rows.filter(r => r.kind === "penalty").map(r => r.effect)),
      reaches: reaches.length ? each(reaches) : ["Incentive Tier 1 (36%)"],
      price: rm2(WIDE_PRICE),
    },
  };
  const said = (text: string) => ({ ...base, ...NONE, tierLabel: /cost/i.test(text) ? "Cost pending" : "Not calculated", note: text });
  if (!items) return { ...base, ...NONE, tierLabel: "Add products", note: null };
  if (!(typed > 0)) {
    if (args.refused) return said(args.refused);
    return { ...base, ...NONE, tierLabel: "Enter a price", note: null, next: args.first ? nextOf(args.first.threshold, args.first.price) : null };
  }
  if (args.pending) return { ...base, ...NONE, tierLabel: "Calculating", note: null };
  if (error) return said(error);
  if (!result || result.margin === null) return { ...base, ...NONE, tierLabel: "Enter a price", note: null };
  const row = rowFor(result.margin, ladder);
  const next = result.nextPrice !== null && result.nextThreshold !== null ? nextOf(result.nextThreshold, result.nextPrice) : null;
  return {
    ...base,
    marginText: result.margin.toFixed(1) + "%",
    tierLabel: row?.label ?? result.label,
    tone: row?.tone ?? (result.margin < 0 ? "bad" : "neutral"),
    penalty: row?.kind === "penalty" ? row.effect : null,
    next,
    reached: !next && top && row?.kind === "incentive" && Math.abs(row.threshold - top.threshold) < 1e-9 ? `${top.label} (${pctText(top.threshold)}%)` : null,
    note: null,
  };
}
