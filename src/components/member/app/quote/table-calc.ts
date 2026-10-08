import type { QuoteInput, QuoteResult } from "@/lib/member/types";

/**
 * The design preview's calculator: the prototype priced a cart from list
 * prices and a cost ratio per kind (RevenueApp.dc.html 2474–2486), so its
 * step 2 is answered from a table of those figures instead of the server.
 * Never used by the live app — a live cost never reaches the phone.
 */
export type PriceTable = Record<string, { list: number; cost: number; name: string; kpi: boolean }>;

export function tableCalc(input: QuoteInput, table: PriceTable, divisor: number, incentives: number[]): { ok: true; data: QuoteResult } | { ok: false; error: string } {
  const price = Number(input.price);
  const lines = input.lines.map(l => ({ ...(table[l.productId] ?? { list: 0, cost: 0, name: l.productId, kpi: false }), qty: l.quantity }));
  const teamCost = lines.filter(l => !l.kpi).reduce((a, l) => a + l.cost * l.qty, 0) / divisor;
  if (!(price > 0)) return { ok: false, error: "Enter a selling price greater than 0." };
  const margin = ((price - teamCost) / price) * 100;
  const next = [...incentives].sort((a, b) => a - b).find(p => p > margin + 1e-9) ?? null;
  const nextPrice = next !== null ? Math.ceil((teamCost / (1 - next / 100)) * 100) / 100 : null;
  const delivery = Number(input.delivery) || 0;
  // KPI items the customer buys ride on top of the price, as the live calculator's do.
  const addOns = lines.filter(l => l.kpi).reduce((a, l) => a + l.list * l.qty, 0);
  const pays = price + addOns + delivery;
  const text = ["HOUZS VENTURE · Product quotation", ...lines.map(l => `Product · ${l.name} × ${l.qty}`),
    `Selling price: RM ${price.toFixed(2)}`, ...(addOns > 0 ? [`Add-on items: RM ${addOns.toFixed(2)}`] : []),
    `Additional charges: RM ${delivery.toFixed(2)}`, `Total: RM ${pays.toFixed(2)}`].join("\n");
  return {
    ok: true,
    data: {
      valid: true, price, delivery, margin, label: "", tone: "neutral", multiplier: 1, nextPrice, nextThreshold: next, boundary: null,
      kpiAmount: 0, addOnAmount: addOns, customerPays: pays, version: "", inputKey: "", suggestions: [], customerText: text,
    },
  };
}
