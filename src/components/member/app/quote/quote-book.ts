import type { MemberBand, QuoteInput, QuoteResult } from "@/lib/member/types";
import type { Outcome } from "../source";
import { anchorOf, repriced, standIn, type Anchor, type QuoteCart } from "./reprice";

/**
 * What step 2 knows from the server, and what it asks it next (2026-10-14).
 *
 * The margin on screen never waits for an answer it can work out: each cart is
 * asked once — as soon as it changes, on the products page too, at the price
 * typed or else at a stand-in — and every price after that is worked out on the
 * phone (`repriced`). The price on screen is still sent, once the typing
 * pauses, for the server's own answer: the customer's quote takes only that.
 * One question at a time, always the newest — Server Actions queue one behind
 * another, and four digits used to wait for four answers.
 */

/** The server's latest answer to a price the member typed. */
export interface Said {
  key: string;
  cartId: string;
  result: QuoteResult | null;
  error: string | null;
  /** Never reached the server (offline, a new release): no word on the cart. */
  failed: boolean;
}

export interface QuoteBook {
  last: Said | null;
  /** Each cart's sums, from its newest good answer. */
  anchors: ReadonlyMap<string, Anchor>;
  /** Carts the server would not price at any price — the stand-in's refusal. */
  refused: ReadonlyMap<string, string>;
  /** The stand-in asked last, answered: never asked twice. */
  standIn: string | null;
}

export const EMPTY_BOOK: QuoteBook = { last: null, anchors: new Map(), refused: new Map(), standIn: null };

export interface Ask {
  key: string;
  cartId: string;
  input: QuoteInput;
  standIn: boolean;
  /** How long nothing must change before it is sent, ms. */
  wait: number;
  /** The brand's ladder as the phone has it, to read the answer back against. */
  bands: readonly MemberBand[];
}

/** A cart the server has not answered yet: the margin waits on it, so it goes soon. */
export const SOON_MS = 120;
/** The price on screen, for the customer's quote: once the typing pauses. */
export const SETTLE_MS = 250;
/** Carts remembered — a few steps of +/- back and forth. */
const KEEP = 24;

export const NOT_REACHED = "The calculator could not be reached. Check the connection and try again.";

export interface Moment {
  cart: QuoteCart | null;
  cartId: string;
  input: QuoteInput | null;
  inputKey: string;
  /** Step 2 (or the desktop's calculator) is on screen. */
  pricing: boolean;
  /** May ask at all: pricing, or a member building their own cart. */
  allowed: boolean;
  bands: readonly MemberBand[];
}

export function nextAsk(book: QuoteBook, at: Moment): Ask | null {
  if (!at.allowed || !at.cart) return null;
  const known = book.anchors.has(at.cartId) || book.refused.has(at.cartId);
  const typed = (wait: number): Ask => ({ key: at.inputKey, cartId: at.cartId, input: at.input!, standIn: false, wait, bands: at.bands });
  if (!known) {
    // The price typed answers for the cart as well as any; else the stand-in.
    if (at.input && book.last?.key !== at.inputKey) return typed(SOON_MS);
    const input = standIn(at.cart);
    const key = JSON.stringify(input);
    if (book.standIn !== key) return { key, cartId: at.cartId, input, standIn: true, wait: SOON_MS, bands: at.bands };
  }
  if (at.pricing && at.input && book.last?.key !== at.inputKey) return typed(SETTLE_MS);
  return null;
}

function kept<V>(map: ReadonlyMap<string, V>, key: string, value: V): Map<string, V> {
  const next = new Map(map);
  next.delete(key);
  next.set(key, value);
  while (next.size > KEEP) next.delete(next.keys().next().value!);
  return next;
}

function without<V>(map: ReadonlyMap<string, V>, key: string): ReadonlyMap<string, V> {
  if (!map.has(key)) return map;
  const next = new Map(map);
  next.delete(key);
  return next;
}

/** The book once `ask` was answered (`failed`: it never reached the server). */
export function recordAnswer(book: QuoteBook, ask: Ask, outcome: Outcome<QuoteResult>, failed = false): QuoteBook {
  let { anchors, refused } = book;
  let standIn = ask.standIn ? ask.key : book.standIn;
  const last: Said | null = ask.standIn ? book.last : {
    key: ask.key, cartId: ask.cartId, result: outcome.ok ? outcome.data : null, error: outcome.ok ? null : outcome.error, failed,
  };
  if (outcome.ok) {
    const anchor = anchorOf(outcome.data, ask.bands);
    anchors = anchor ? kept(anchors, ask.cartId, anchor) : without(anchors, ask.cartId);
    refused = without(refused, ask.cartId);
  } else if (ask.standIn) {
    // At a price far above any cart, a refusal is the cart's own.
    refused = kept(refused, ask.cartId, outcome.error);
    anchors = without(anchors, ask.cartId);
  } else if (!failed) {
    // Refused at the member's price: what was read before may not hold any more. The
    // stand-in is asked again — the cart's own refusal then shows at every price; a
    // price's alone (free KPI items that take all of it) leaves the others worked out.
    anchors = without(anchors, ask.cartId);
    standIn = null;
  }
  return { last, anchors, refused, standIn };
}

/** What step 2 shows for the input on screen. `pending`: its cart has not been answered yet. */
export function shownAnswer(book: QuoteBook, at: Pick<Moment, "cartId" | "input" | "inputKey">): { result: QuoteResult | null; error: string | null; pending: boolean } {
  if (!at.input) return { result: null, error: null, pending: false };
  const last = book.last?.key === at.inputKey ? book.last : null;
  // The server's own word on exactly this, when it has spoken.
  if (last && !last.failed) return { result: last.result, error: last.error, pending: false };
  const anchor = book.anchors.get(at.cartId);
  const worked = anchor ? repriced(anchor, at.input) : null;
  if (worked) return worked.ok ? { result: worked.data, error: null, pending: false } : { result: null, error: worked.error, pending: false };
  if (last) return { result: null, error: last.error, pending: false };
  const refused = book.refused.get(at.cartId);
  if (refused) return { result: null, error: refused, pending: false };
  return { result: null, error: null, pending: true };
}

/** The server's answer to exactly the input on screen — what the customer's quote is built from. */
export function confirmedAnswer(book: QuoteBook, inputKey: string): QuoteResult | null {
  const last = book.last;
  return last && last.key === inputKey && !last.failed && last.result?.valid ? last.result : null;
}
