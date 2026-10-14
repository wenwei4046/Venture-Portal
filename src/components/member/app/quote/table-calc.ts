import type { MemberBand, QuoteInput, QuoteResult } from "@/lib/member/types";
import { atPrice, cents } from "@/lib/member/quote-price";

/**
 * The design preview's calculator: the prototype priced a cart from list
 * prices and a cost ratio per kind (RevenueApp.dc.html 2474–2486), so its
 * step 2 is answered from a table of those figures instead of the server —
 * through the live calculator's own price arithmetic (`atPrice`), in sen, so
 * the keypad works the preview's answers out as it does the server's.
 * Never used by the live app — a live cost never reaches the phone.
 */
export type PriceTable = Record<string, { list: number; cost: number; name: string; kpi: boolean }>;

export function tableCalc(input: QuoteInput, table: PriceTable, divisor: number, bands: readonly MemberBand[]): { ok: true; data: QuoteResult } | { ok: false; error: string } {
  const price = cents(input.price), delivery = cents(input.delivery || "0") ?? 0;
  const lines = input.lines.map(l => ({ ...(table[l.productId] ?? { list: 0, cost: 0, name: l.productId, kpi: false }), qty: l.quantity }));
  if (price === null || price <= 0) return { ok: false, error: "Enter a selling price greater than 0." };
  const cost = Math.round((lines.filter(l => !l.kpi).reduce((a, l) => a + l.cost * l.qty, 0) / divisor) * 100);
  // KPI items the customer buys ride on top of the price, as the live calculator's do.
  const addOns = Math.round(lines.filter(l => l.kpi).reduce((a, l) => a + l.list * l.qty, 0) * 100);
  const priced = atPrice({ cost, gift: 0, onTop: addOns, charge: 0 }, bands, price, delivery);
  if (!priced.ok) return { ok: false, error: priced.error };
  const q = priced.quote;
  const text = ["HOUZS VENTURE · Product quotation", ...lines.map(l => `Product · ${l.name} × ${l.qty}`),
    `Selling price: RM ${q.price.toFixed(2)}`, ...(addOns > 0 ? [`Add-on items: RM ${(addOns / 100).toFixed(2)}`] : []),
    `Additional charges: RM ${q.delivery.toFixed(2)}`, `Total: RM ${q.customerPays!.toFixed(2)}`].join("\n");
  return {
    ok: true,
    // The option charges are the cart's own in the preview (its table has none).
    data: { valid: true, ...q, optionCharge: undefined, version: "", inputKey: "", suggestions: [], customerText: text },
  };
}
